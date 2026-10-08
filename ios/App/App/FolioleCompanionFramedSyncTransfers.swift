import Capacitor
import Foundation
import FolioleFramedSyncRuntime

extension FolioleCompanionSyncPlugin {
    @objc func sendFramedSyncTransfers(_ call: CAPPluginCall) {
        Task.detached { [weak self] in
            guard let self else { return call.reject("Companion Sync plugin is unavailable") }
            do { call.resolve(["outcomes": try await self.sendFramedSelections(call.jsObjectRepresentation, multiple: true)]) }
            catch { call.reject("Failed to send framed Sync transfers: \(error.localizedDescription)", nil, error) }
        }
    }

    func sendFramedSelections(_ value: [String: Any], multiple: Bool) async throws -> [[String: Any]] {
        try FolioleFramedSyncOutboundRequest.validateMetadata(value)
        let owner = try FolioleFramedSyncPayloadBudgetRegistry.shared.requireCurrent()
        let bridge = FolioleFramedSyncOwnedBridge(bridge: groupData, owner: owner)
        let request = try await FolioleFramedSyncPayloadWorker.run { try FolioleFramedSyncOutboundRequest.decode(value, bridge: bridge) }
        let selections = try multiple ? request.selections(value["transfers"]) : [request.selection(value)]
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-framed-send-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let staging = try FolioleFramedSyncOutboundSQLite(database: .init(url: FolioleFramedSyncOutboundSQLite.applicationDatabaseURL()), owner: owner)
        let sender = FolioleFramedSyncOutboundBatchSender(request: request, owner: owner, bridge: bridge,
            staging: staging, directory: directory) { body, response, sequence in
            try await self.uploadFramedBatch(request, body: body, response: response, sequence: sequence, owner: owner)
        }
        return try await sender.send(selections) { selection, index in
            try await FolioleFramedSyncPayloadWorker.run {
                try FolioleFramedSyncOutboundPreparation.prepare(selection, index: index, request: request,
                    bridge: bridge, staging: staging, root: directory, owner: owner)
            }
        }
    }

    private func uploadFramedBatch(_ request: FolioleFramedSyncOutboundRequest, body: URL, response: URL,
        sequence: Bool, owner: FolioleFramedSyncPayloadBudget) async throws {
        let context = request.context
        let path = try framedPath(context.senderDeviceID, context.senderLibraryEpoch, context.receiverDeviceID, context.receiverLibraryEpoch)
        let headers = try await FolioleFramedSyncPayloadWorker.run {
            try self.framedHeaders(groupID: context.groupID, deviceID: context.senderDeviceID,
                workgroupKey: request.workgroupKey, path: path, bodyURL: body, owner: owner)
        }
        guard let base = URL(string: request.endpoint), let url = URL(string: path, relativeTo: base) else {
            throw invalid("framed_sync_endpoint_invalid")
        }
        _ = try await FolioleFramedSyncHTTPTransport.post(endpoint: url.absoluteURL,
            peer: .init(groupID: context.groupID, deviceID: context.receiverDeviceID,
                libraryEpoch: context.receiverLibraryEpoch, memberAuthHeaders: headers),
            requestBodyURL: body, responseBodyURL: response, owner: owner, responseLane: .receipt, receiptSequence: sequence)
    }
}
