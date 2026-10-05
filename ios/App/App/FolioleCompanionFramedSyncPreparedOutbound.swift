import CoreFoundation
import Foundation
import FolioleFramedSyncRuntime

struct FolioleCompanionFramedSyncPreparedOutbound {
    let contentID: Data
    let transferID: Data
    let facts: [Foliole_Sync_V22_FactRecord]
    let blobs: [FolioleFramedSyncOutboundBlob]

    static func decode(_ value: [String: Any]) throws -> Self {
        let contentID = try digest(value, "content_id")
        guard try digest(value, "manifest_hash") == contentID else {
            throw invalid("framed_sync_manifest_identity_mismatch")
        }
        let facts = try decodeFacts(value)
        return .init(
            contentID: contentID, transferID: try digest(value, "transfer_id"), facts: facts,
            blobs: try decodeBlobs(value, facts: facts)
        )
    }

    private static func decodeFacts(_ value: [String: Any]) throws -> [Foliole_Sync_V22_FactRecord] {
        guard let encoded = value["fact_message_bytes_list"] as? [Any], !encoded.isEmpty else {
            throw invalid("framed_sync_fact_bytes_required")
        }
        return try encoded.map { raw in
            guard let raw = raw as? [Any] else { throw invalid("framed_sync_fact_bytes_invalid") }
            let numbers = raw.compactMap { $0 as? NSNumber }
            guard numbers.count == raw.count, numbers.allSatisfy(validByte) else {
                throw invalid("framed_sync_fact_bytes_invalid")
            }
            let message = try FolioleFramedSyncCodec.decode(
                Data(numbers.map(\.uint8Value)),
                authenticatedFrameType: FolioleFramedSyncFrameType.fact.rawValue
            )
            guard case .fact(let fact) = message.payload else { throw invalid("framed_sync_fact_required") }
            return fact
        }
    }

    private static func decodeBlobs(
        _ value: [String: Any], facts: [Foliole_Sync_V22_FactRecord]
    ) throws -> [FolioleFramedSyncOutboundBlob] {
        guard let encoded = value["blobs"] as? [Any] else { throw invalid("framed_sync_blobs_required") }
        var declared = [Data: Foliole_Sync_V22_BlobReference]()
        for reference in facts.flatMap(\.blobs) {
            if let existing = declared[reference.sha256], !sameBlob(existing, reference) {
                throw invalid("framed_sync_blob_identity_conflict")
            }
            declared[reference.sha256] = reference
        }
        guard encoded.count == declared.count else { throw invalid("framed_sync_blob_set_mismatch") }
        return try encoded.map { item in
            guard let blob = item as? [String: Any], let text = blob["data_text"] as? String,
                  let lengthText = blob["byte_length"] as? String,
                  let length = UInt64(lengthText), String(length) == lengthText,
                  let required = blob["required"] as? Bool,
                  let role = blob["role"] as? NSNumber, validInteger(role) else {
                throw invalid("framed_sync_blob_invalid")
            }
            let hash = try digest(blob, "sha256")
            guard let reference = declared.removeValue(forKey: hash),
                  reference.byteLength == length, reference.required == required,
                  Int(reference.role.rawValue) == role.intValue,
                  UInt64(Data(text.utf8).count) == length else {
                throw invalid("framed_sync_blob_identity_mismatch")
            }
            return .init(reference: reference, data: Data(text.utf8))
        }
    }

    private static func digest(_ value: [String: Any], _ key: String) throws -> Data {
        guard let text = value[key] as? String,
              text.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw invalid("framed_sync_digest_invalid")
        }
        return Data(stride(from: 0, to: text.count, by: 2).map { offset in
            let start = text.index(text.startIndex, offsetBy: offset)
            return UInt8(text[start..<text.index(start, offsetBy: 2)], radix: 16)!
        })
    }

    private static func validByte(_ value: NSNumber) -> Bool {
        validInteger(value) && (0...255).contains(value.intValue)
    }

    private static func validInteger(_ value: NSNumber) -> Bool {
        CFGetTypeID(value) != CFBooleanGetTypeID() && value.doubleValue == Double(value.intValue)
    }

    private static func sameBlob(
        _ left: Foliole_Sync_V22_BlobReference, _ right: Foliole_Sync_V22_BlobReference
    ) -> Bool {
        left.sha256 == right.sha256 && left.byteLength == right.byteLength &&
            left.role == right.role && left.required == right.required
    }

    private static func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}
