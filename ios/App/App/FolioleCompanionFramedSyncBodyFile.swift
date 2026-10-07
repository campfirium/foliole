import Foundation
import FolioleFramedSyncRuntime

extension FolioleCompanionSyncPlugin {
    func preparedFramedBody(
        _ reference: Foliole_Sync_V22_BlobReference, selection: [String: Any], transferID: String, directory: URL
    ) throws -> URL {
        try FolioleFramedSyncVerifiedBodySpool.write(reference: reference, directory: directory) { offset, size in
            var request = [String: Any]()
            for key in ["group_id", "sender_device_id", "sender_library_epoch",
                        "receiver_device_id", "receiver_library_epoch"] {
                request[key] = try self.required(selection, key)
            }
            request["transfer_id"] = transferID
            request["sha256"] = reference.sha256.hex
            request["offset"] = String(offset)
            request["max_bytes"] = size
            return try FolioleFramedSyncBodyRangeResponse.decode(
                value: self.groupData.request("read_framed_body_range", request),
                hash: reference.sha256, offset: offset, maxBytes: size
            )
        }
    }
}
