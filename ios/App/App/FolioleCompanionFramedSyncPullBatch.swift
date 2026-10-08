import Capacitor
import Foundation
import FolioleFramedSyncRuntime

extension FolioleCompanionSyncPlugin {
    @objc func pullFramedSyncObjects(_ call: CAPPluginCall) {
        Task.detached { [weak self] in
            guard let self else { return call.reject("Companion Sync plugin is unavailable") }
            do { call.resolve(["received": try await self.pullFramedObjects(call.jsObjectRepresentation)]) }
            catch { call.reject("Failed to pull framed Sync objects: \(error.localizedDescription)", nil, error) }
        }
    }

    private func pullFramedObjects(_ value: [String: Any]) async throws -> [[String: Any]] {
        let requested = try FolioleFramedSyncPullBatchRequest.decode(value)
        let owner = try FolioleFramedSyncPayloadBudgetRegistry.shared.requireCurrent()
        let bridge = FolioleFramedSyncOwnedBridge(bridge: groupData, owner: owner)
        let request = try await FolioleFramedSyncPayloadWorker.run { try FolioleFramedSyncOutboundRequest.decode(value, bridge: bridge) }
        let local = request.context
        let session = try FolioleFramedSyncSessionContext(groupID: local.groupID,
            initiatorDeviceID: local.senderDeviceID, initiatorLibraryEpoch: local.senderLibraryEpoch,
            responderDeviceID: local.receiverDeviceID, responderLibraryEpoch: local.receiverLibraryEpoch)
        let inbound = FolioleFramedSyncTransferContext(groupID: local.groupID,
            senderDeviceID: local.receiverDeviceID, senderLibraryEpoch: local.receiverLibraryEpoch,
            receiverDeviceID: local.senderDeviceID, receiverLibraryEpoch: local.senderLibraryEpoch)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-pull-batch-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let body = directory.appendingPathComponent("request"), response = directory.appendingPathComponent("response")
        try await FolioleFramedSyncPayloadWorker.run {
            try FolioleFramedSyncSessionWriter.writeFile(to: body, groupKey: request.groupKey, context: session, owner: owner) { emit in
                for object in requested { try emit(object.message) }
            }
        }
        let path = try framedPath(local.senderDeviceID, local.senderLibraryEpoch, local.receiverDeviceID, local.receiverLibraryEpoch)
        let headers = try await FolioleFramedSyncPayloadWorker.run {
            try self.framedHeaders(groupID: local.groupID, deviceID: local.senderDeviceID,
                workgroupKey: request.workgroupKey, path: path, bodyURL: body, owner: owner)
        }
        guard let base = URL(string: request.endpoint), let url = URL(string: path, relativeTo: base) else { throw invalid("framed_sync_endpoint_invalid") }
        _ = try await FolioleFramedSyncHTTPTransport.post(endpoint: url.absoluteURL,
            peer: .init(groupID: local.groupID, deviceID: local.receiverDeviceID, libraryEpoch: local.receiverLibraryEpoch,
                memberAuthHeaders: headers), requestBodyURL: body, responseBodyURL: response, owner: owner)
        let receiver = try FolioleFramedSyncTransferReceiver(database: .init(url: framedInboundDatabaseURL()), owner: owner)
        return try await FolioleFramedSyncPullBatchReceiver(receiver: receiver, context: inbound,
            groupKey: request.groupKey, owner: owner, bridge: bridge).receive(response, requested: requested) { receipt, loan in
                try await self.framedPost(endpoint: request.endpoint, path: path,
                    peer: .init(groupID: local.groupID, deviceID: local.receiverDeviceID, libraryEpoch: local.receiverLibraryEpoch,
                        memberAuthHeaders: self.framedHeaders(groupID: local.groupID, deviceID: local.senderDeviceID,
                            workgroupKey: request.workgroupKey, path: path, body: receipt)),
                    body: receipt, owner: owner, requestLoan: loan)
            }
    }
}
