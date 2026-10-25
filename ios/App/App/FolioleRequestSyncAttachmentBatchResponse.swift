import Capacitor
import Foundation
import FolioleFramedSyncRuntime

enum FolioleRequestSyncAttachmentBatchResponse {
    static func post(_ call: CAPPluginCall, owner: FolioleFramedSyncPayloadBudget,
                     bridge: FolioleCompanionSyncGroupDataRequesting, files: FolioleFramedSyncFiles,
                     directory: String, count: Int, url: URL, peer: FolioleFramedSyncHTTPPeer) async throws -> JSObject {
        guard call.getObject("attachment_receive") == nil, let id = call.getString("request_id"),
              call.getObject("attachment_batch")?["operation_id"] as? String == id else {
            throw FolioleFramedSyncValidationError("attachment_batch_http_mismatch")
        }
        let batch = try FolioleAttachmentBatches.get(owner: owner, id: id)
        try batch.start()
        var failure: Error?
        do {
            let key = try await FolioleFramedSyncPayloadWorker.run {
                try batch.check()
                let credential = try bridge.request("load_current_credential", ["group_id": peer.groupID], documentOwner: owner)
                guard let initiator = credential["device_id"] as? String, let encodedKey = credential["workgroup_key"] as? String else {
                    throw FolioleFramedSyncValidationError("attachment_response_initiator_mismatch")
                }
                let context = try FolioleFramedSyncSessionContext(groupID: peer.groupID, initiatorDeviceID: initiator,
                    initiatorLibraryEpoch: batch.initiatorEpoch, responderDeviceID: peer.deviceID, responderLibraryEpoch: peer.libraryEpoch)
                guard try context.deriveContextID(sessionID: Data(count: 16)) == batch.context.deriveContextID(sessionID: Data(count: 16)) else {
                    throw FolioleFramedSyncValidationError("attachment_batch_http_mismatch")
                }
                try batch.check(); return try Base64URL.decode(encodedKey)
            }
            let decoder = FolioleRequestSyncAttachmentBatchDecoder(groupKey: key, context: batch.context,
                permission: batch.permission, check: { try batch.check(); batch.progress() }, consume: batch.receiver.accept)
            let body = try files.singleAttachmentHTTPBody(directory: directory, count: count)
            let unusedResponse = try files.attachmentHTTPResponsePlaceholder(directory: directory)
            try Task.checkCancellation(); try batch.check()
            var lastProgress = -Double.infinity
            _ = try await FolioleFramedSyncHTTPTransport.post(endpoint: url, peer: peer,
                requestBodyURL: body, responseBodyURL: unusedResponse, owner: owner, maximumResponseBytes: batch.permission.maximumWireBytes,
                onProgress: {
                    guard ProcessInfo.processInfo.systemUptime - lastProgress >= 0.25 else { return }
                    lastProgress = ProcessInfo.processInfo.systemUptime
                    if let roundID = call.getString("peer_round_id") {
                        try FolioleRequestSyncHTTPChunks.touchRound(bridge: bridge, owner: owner, peer: peer.deviceID, roundID: roundID, direction: "outbound")
                    }
                }, bodyConsumer: .init(append: decoder.append, finish: decoder.finish, cancel: batch.stop))
        } catch { failure = error }
        try batch.finishData(failure)
        return ["response_chunk_count": 0, "response_byte_length": 0]
    }
}
