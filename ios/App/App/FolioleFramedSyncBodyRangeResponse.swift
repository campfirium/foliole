import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncBodyRangeResponse {
    static func decode(
        value: [String: Any], hash: Data, offset: UInt64, maxBytes: Int
    ) throws -> Data {
        guard (1...(512 * 1024)).contains(maxBytes), hash.count == 32,
              value["sha256"] as? String == hash.hex,
              value["offset"] as? String == String(offset),
              let lengthText = value["byte_length"] as? String,
              let length = UInt64(lengthText), String(length) == lengthText,
              length <= UInt64(maxBytes),
              let encoded = value["data_base64"] as? String,
              encoded.utf8.count <= 4 * ((maxBytes + 2) / 3),
              let bytes = Data(base64Encoded: encoded),
              bytes.base64EncodedString() == encoded, UInt64(bytes.count) == length else {
            throw FolioleFramedSyncValidationError("framed_sync_body_range_response_invalid")
        }
        return bytes
    }
}
