import CoreFoundation
import Foundation
import FolioleFramedSyncRuntime

struct FolioleCompanionFramedSyncPreparedOutbound {
    let contentID: Data
    let transferID: Data
    let header: Foliole_Sync_V22_TransferHeader
    let blobs: [FolioleFramedSyncOutboundBlob]

    static func decode(
        _ value: [String: Any], resourceFiles: [String: URL] = [:],
        frozenBodyFile: ((Foliole_Sync_V22_BlobReference) throws -> URL)? = nil
    ) throws -> Self {
        let header = try decodeHeader(value)
        return try decodeMetadata(value, header: header, resourceFiles: resourceFiles, frozenBodyFile: frozenBodyFile)
    }

    static func decodeHeader(_ value: [String: Any]) throws -> Foliole_Sync_V22_TransferHeader {
        let contentID = try digest(value, "content_id")
        guard try digest(value, "manifest_hash") == contentID else {
            throw invalid("framed_sync_manifest_identity_mismatch")
        }
        let message = try FolioleFramedSyncCodec.decode(messageBytes(value, "header_message_bytes"), authenticatedFrameType: 2)
        guard case .transferHeader(let header) = message.payload,
              header.attemptID == Data(repeating: 0, count: 16), header.manifest.contentID == contentID,
              header.transferID == (try digest(value, "transfer_id")) else {
            throw invalid("framed_sync_transfer_identity_mismatch")
        }
        return header
    }

    static func decodeMetadata(_ value: [String: Any], header: Foliole_Sync_V22_TransferHeader,
        resourceFiles: [String: URL], frozenBodyFile: ((Foliole_Sync_V22_BlobReference) throws -> URL)?) throws -> Self {
        .init(contentID: header.manifest.contentID, transferID: header.transferID, header: header,
            blobs: try decodeBlobs(value, references: header.manifest.blobs,
                                  resourceFiles: resourceFiles, frozenBodyFile: frozenBodyFile))
    }

    static func messageBytes(_ value: [String: Any], _ key: String) throws -> Data {
        guard let raw = value[key] as? [Any], !raw.isEmpty,
              raw.count <= FolioleFramedSyncLimits.maxFrameMessageBytes else {
            throw invalid("framed_sync_fact_bytes_required")
        }
        let numbers = raw.compactMap { $0 as? NSNumber }
        guard numbers.count == raw.count, numbers.allSatisfy(validByte) else {
            throw invalid("framed_sync_fact_bytes_invalid")
        }
        return Data(numbers.map(\.uint8Value))
    }

    private static func decodeBlobs(
        _ value: [String: Any], references: [Foliole_Sync_V22_BlobReference], resourceFiles: [String: URL],
        frozenBodyFile: ((Foliole_Sync_V22_BlobReference) throws -> URL)?
    ) throws -> [FolioleFramedSyncOutboundBlob] {
        guard let encoded = value["blobs"] as? [Any] else { throw invalid("framed_sync_blobs_required") }
        var declared = [Data: Foliole_Sync_V22_BlobReference]()
        for reference in references {
            if let existing = declared[reference.sha256], !sameBlob(existing, reference) {
                throw invalid("framed_sync_blob_identity_conflict")
            }
            declared[reference.sha256] = reference
        }
        guard encoded.count == declared.count else { throw invalid("framed_sync_blob_set_mismatch") }
        return try encoded.map { item in
            guard let blob = item as? [String: Any], let lengthText = blob["byte_length"] as? String,
                  let length = UInt64(lengthText), String(length) == lengthText,
                  let required = blob["required"] as? Bool,
                  let role = blob["role"] as? NSNumber, validInteger(role) else {
                throw invalid("framed_sync_blob_invalid")
            }
            let hash = try digest(blob, "sha256")
            guard let reference = declared.removeValue(forKey: hash),
                  reference.byteLength == length, reference.required == required,
                  Int(reference.role.rawValue) == role.intValue else {
                throw invalid("framed_sync_blob_identity_mismatch")
            }
            return try decodeSource(blob, reference: reference, resourceFiles: resourceFiles,
                                    frozenBodyFile: frozenBodyFile)
        }
    }

    private static func decodeSource(
        _ blob: [String: Any], reference: Foliole_Sync_V22_BlobReference, resourceFiles: [String: URL],
        frozenBodyFile: ((Foliole_Sync_V22_BlobReference) throws -> URL)?
    ) throws -> FolioleFramedSyncOutboundBlob {
        let isBody = reference.role == .nodeBody || reference.role == .externalDocument
        if blob["body_source"] != nil {
            guard blob["body_source"] as? String == "frozen_body", isBody,
                  blob["data_text"] == nil, blob["storage_key"] == nil,
                  let frozenBodyFile else { throw invalid("framed_sync_blob_identity_mismatch") }
            return .init(reference: reference, source: .file(try frozenBodyFile(reference)))
        }
        if isBody {
            guard let text = blob["data_text"] as? String,
                  UInt64(Data(text.utf8).count) == reference.byteLength else {
                throw invalid("framed_sync_blob_identity_mismatch")
            }
            return .init(reference: reference, source: .data(Data(text.utf8)))
        }
        guard let storageKey = blob["storage_key"] as? String, let file = resourceFiles[storageKey] else {
            throw invalid("framed_sync_outbound_resource_unavailable")
        }
        return .init(reference: reference, source: .file(file))
    }

    static func digest(_ value: [String: Any], _ key: String) throws -> Data {
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
