import Capacitor
import Foundation
import FolioleFramedSyncRuntime

enum FolioleRequestSyncAttachmentResponse {
    static func read(_ call: CAPPluginCall, files: FolioleFramedSyncFiles, directory: String,
                     input: URL, owner: FolioleFramedSyncPayloadBudget, bridge: FolioleCompanionSyncGroupDataRequesting) throws -> JSObject {
        guard let options = call.getObject("attachment_response"), let maxBlocks = options["max_blocks"] as? Int,
              let initiator = options["initiator_device_id"] as? String,
              let initiatorEpoch = options["initiator_library_epoch"] as? String,
              let group = call.getString("sync_group_id"), let peer = call.getString("receiver_device_id"),
              let epoch = call.getString("receiver_library_epoch"), let input = InputStream(url: input) else {
            throw FolioleFramedSyncValidationError("attachment_response_context_missing")
        }
        let credential = try bridge.request("load_current_credential", ["group_id": group], documentOwner: owner)
        guard credential["device_id"] as? String == initiator, let encodedKey = credential["workgroup_key"] as? String else {
            throw FolioleFramedSyncValidationError("attachment_response_initiator_mismatch")
        }
        let key = try Base64URL.decode(encodedKey)
        let context = try FolioleFramedSyncSessionContext(groupID: group, initiatorDeviceID: initiator,
            initiatorLibraryEpoch: initiatorEpoch, responderDeviceID: peer, responderLibraryEpoch: epoch)
        var messages = [JSObject]()
        let preamble = try FolioleRequestSyncAttachmentFrames.read(stream: FolioleFramedSyncStreamReader(input: input),
            groupKey: key, context: context, maxBlocks: maxBlocks, check: {
                if FolioleFramedSyncPayloadWorker.currentCancellation?.isCancelled == true { throw CancellationError() }
                try owner.requireActive()
            }) { index, metadata, block in
            let fileKey = block.isEmpty ? "" : "\(directory)/attachment-\(index)"
            if !fileKey.isEmpty { try files.write(fileKey, data: block) }
            messages.append(["metadata_base64": metadata.base64EncodedString(), "file_key": fileKey, "byte_length": block.count])
        }
        return ["response_chunk_count": 0, "response_byte_length": 0,
                "attachment_response": ["preamble_base64": preamble.base64EncodedString(), "messages": messages]]
    }
}
