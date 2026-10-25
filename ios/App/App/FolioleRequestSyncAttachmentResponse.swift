import Capacitor
import Foundation
import FolioleFramedSyncRuntime

enum FolioleRequestSyncAttachmentResponse {
    static func permission(_ call: CAPPluginCall) throws -> FolioleAttachmentReceiveAuthorization? {
        guard let options = call.getObject("attachment_receive") else { return nil }
        guard let encoded = options["request_id_base64"] as? String, let requestID = Data(base64Encoded: encoded),
              let key = options["storage_key"] as? String, let length = options["byte_length"] as? Int, length >= 0,
              let offset = options["offset"] as? Int, offset >= 0, let blocks = options["max_blocks"] as? Int else {
            throw FolioleFramedSyncValidationError("attachment_receive_authorization_invalid")
        }
        return try .init(requestID: requestID, storageKey: key, byteLength: UInt64(length), offset: UInt64(offset), maxBlocks: blocks)
    }
    static func prepare(_ call: CAPPluginCall, permission: FolioleAttachmentReceiveAuthorization,
                        owner: FolioleFramedSyncPayloadBudget, bridge: FolioleCompanionSyncGroupDataRequesting) throws
        -> (body: FolioleFramedSyncHTTPBodyConsumer, result: () -> JSObject, close: () -> Void) {
        guard let options = call.getObject("attachment_receive"), let initiator = options["initiator_device_id"] as? String,
              let initiatorEpoch = options["initiator_library_epoch"] as? String,
              let group = call.getString("sync_group_id"), let peer = call.getString("receiver_device_id"),
              let epoch = call.getString("receiver_library_epoch") else {
            throw FolioleFramedSyncValidationError("attachment_response_context_missing")
        }
        let credential = try bridge.request("load_current_credential", ["group_id": group], documentOwner: owner)
        guard credential["device_id"] as? String == initiator, let encodedKey = credential["workgroup_key"] as? String else {
            throw FolioleFramedSyncValidationError("attachment_response_initiator_mismatch")
        }
        let cancellation = FolioleFramedSyncPayloadCancellation()
        let check = {
            if cancellation.isCancelled { throw CancellationError() }
            try owner.requireActive()
        }
        let context = try FolioleFramedSyncSessionContext(groupID: group, initiatorDeviceID: initiator,
            initiatorLibraryEpoch: initiatorEpoch, responderDeviceID: peer, responderLibraryEpoch: epoch)
        let file = try FolioleAttachmentBlockFiles.receive(owner, key: permission.storageKey, offset: permission.start, check: check)
        let decoder = FolioleRequestSyncAttachmentDecoder(groupKey: try Base64URL.decode(encodedKey),
            context: context, permission: permission, check: check) { offset, data in try file.append(offset: offset, data: data) }
        return (.init(append: decoder.append, finish: { try decoder.finish(); try file.close() }, cancel: cancellation.cancel), {
            ["response_chunk_count": 0, "response_byte_length": 0,
             "attachment_receive": ["offset": Int(permission.offset), "blocks": permission.blocks, "pending": permission.pending]]
        }, { try? file.close() })
    }
}
