import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncFileRecords {
    static func read(_ files: FolioleFramedSyncFiles, _ key: String) throws -> [String: Any]? {
        guard let bytes = try files.read(key) else { return nil }
        guard let record = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw invalid() }
        return record
    }

    static func write(_ files: FolioleFramedSyncFiles, _ key: String, _ value: [String: Any]) throws {
        try files.write(key, data: JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]))
    }

    static func bytes(_ value: Any?) throws -> Data {
        guard let values = value as? [Int], values.allSatisfy({ $0 >= 0 && $0 <= 255 }) else { throw invalid() }
        return Data(values.map(UInt8.init))
    }

    static func directory(_ transfer: Data) throws -> String {
        guard transfer.count == 32 else { throw invalid() }
        return "inbound/\(transfer.hex)"
    }

    static func attempt(_ transfer: Data, _ attempt: Data) throws -> String {
        guard attempt.count == 16 else { throw invalid() }
        return try directory(transfer) + "/\(attempt.hex)"
    }

    static func blob(_ value: Foliole_Sync_V22_BlobReference) -> [String: Any] {
        ["sha256": Array(value.sha256), "byteLength": String(value.byteLength),
         "role": value.role.rawValue, "required": value.required]
    }

    static func proposal(_ header: Foliole_Sync_V22_TransferHeader, _ context: FolioleFramedSyncTransferContext) throws -> [String: Any] {
        var total: UInt64 = 0
        for blob in header.manifest.blobs {
            let next = total.addingReportingOverflow(blob.byteLength)
            guard !next.overflow else { throw invalid() }
            total = next.partialValue
        }
        return ["transferId": Array(header.transferID), "contentId": Array(header.manifest.contentID),
                "factCount": String(header.manifest.facts.count), "blobCount": String(header.manifest.blobs.count),
                "totalBlobBytes": String(total), "context": ["protocolVersion": 23, "groupId": context.groupID,
                "senderDeviceId": context.senderDeviceID, "senderLibraryEpoch": context.senderLibraryEpoch,
                "receiverDeviceId": context.receiverDeviceID, "receiverLibraryEpoch": context.receiverLibraryEpoch]]
    }

    static func header(_ value: Foliole_Sync_V22_TransferHeader, proposal: [String: Any], reservation: String) -> [String: Any] {
        var published = proposal
        published["manifestHash"] = Array(value.manifest.contentID)
        return ["attemptId": Array(value.attemptID), "proposal": proposal, "published": published,
                "reservationId": reservation, "blobs": value.manifest.blobs.map(blob),
                "facts": value.manifest.facts.map { fact -> [String: Any] in
                    ["factId": fact.identity.factID, "globalId": fact.identity.globalID,
                     "objectType": fact.identity.objectType, "kind": fact.identity.kind.rawValue,
                     "sharedStateHash": Array(fact.sharedStateHash),
                     "requiredBlobHashes": fact.requiredBlobHashes.map { Array($0) }]
                }]
    }

    static func same(_ left: [String: Any], _ right: [String: Any]) -> Bool {
        NSDictionary(dictionary: left).isEqual(to: right)
    }

    private static func invalid() -> Error { FolioleFramedSyncValidationError("framed_sync_file_record_invalid") }
}
