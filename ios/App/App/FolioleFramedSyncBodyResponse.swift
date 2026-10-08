import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncBodyResponse {
    static func writeFrozen(_ reference: Foliole_Sync_V22_BlobReference, selection: [String: Any],
        transferID: String, directory: URL, bridge: FolioleCompanionSyncGroupDataRequesting,
        owner: FolioleFramedSyncPayloadBudget? = nil) throws -> URL {
        try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound) { loan in
        try FolioleFramedSyncFrozenBodySpool.write(reference: reference, directory: directory) {
            var request = [String: Any]()
            if let loan { request["payload_loan"] = loan.payload }
            for key in ["group_id", "sender_device_id", "sender_library_epoch",
                        "receiver_device_id", "receiver_library_epoch"] {
                guard let value = selection[key] as? String, !value.isEmpty else {
                    throw FolioleFramedSyncValidationError("framed_sync_identity_context_required")
                }
                request[key] = value
            }
            request["transfer_id"] = transferID
            request["sha256"] = reference.sha256.hex
            request["byte_length"] = String(reference.byteLength)
            return try decode(value: bridge.request("read_framed_body", request),
                hash: reference.sha256, byteLength: reference.byteLength)
        }
        }
    }

    static func decode(
        value: [String: Any], hash: Data, byteLength: UInt64
    ) throws -> Data {
        guard byteLength <= 1_048_576, hash.count == 32,
              value["sha256"] as? String == hash.hex,
              let lengthText = value["byte_length"] as? String,
              let length = UInt64(lengthText), String(length) == lengthText,
              length == byteLength,
              let encoded = value["data_base64"] as? String,
              encoded.utf8.count <= 4 * ((Int(byteLength) + 2) / 3),
              let bytes = Data(base64Encoded: encoded),
              bytes.base64EncodedString() == encoded, UInt64(bytes.count) == length else {
            throw FolioleFramedSyncValidationError("framed_sync_body_response_invalid")
        }
        return bytes
    }
}
