import CryptoKit
import Foundation
import FolioleFramedSyncRuntime
import SQLite3

// sql-surface: ios-isolated-snapshot-owner
enum FolioleCompanionSyncGroupResources {
    struct Resource {
        let body: Data
        let contentType: String
        let totalBytes: Int?
        init(body: Data, contentType: String, totalBytes: Int? = nil) {
            self.body = body; self.contentType = contentType; self.totalBytes = totalBytes
        }
    }
    private static let attachmentRangeBytes = 1_048_576

    static func contentBlob(snapshot: URL, hash: String?) throws -> Resource? {
        guard let hash, hash.range(of: "^[a-fA-F0-9]{64}$", options: .regularExpression) != nil else { return nil }
        return try query(snapshot,
            "SELECT cb.mime_type, cbd.data FROM content_blobs cb JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cb.hash = ?",
            [hash.lowercased()]).map { Resource(body: $0.1, contentType: $0.0 ?? "application/octet-stream") }
    }

    static func attachmentFile(attachmentId: String?, contentHash: String?, storageKey: String?) throws
        -> (url: URL, mimeType: String, size: Int)? {
        guard let attachmentId, attachmentId == contentHash, let contentHash, let storageKey,
              let mimeType = FolioleCompanionCanonicalAttachmentKey.mimeType(storageKey),
              FolioleCompanionCanonicalAttachmentKey.matches(contentHash: contentHash, mimeType: mimeType, storageKey: storageKey)
              else { return nil }
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                  appropriateFor: nil, create: false)
        let contract = try FolioleCompanionContractStore().attachmentResourceContract()
        let url = support.appendingPathComponent(contract.directoryName, isDirectory: true).appendingPathComponent(storageKey)
        let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        guard values?.isRegularFile == true, values?.isSymbolicLink != true,
              let size = values?.fileSize else { return nil }
        return (url, mimeType, size)
    }

    static func attachmentRange(attachmentId: String?, contentHash: String?, storageKey: String?,
                                offsetText: String?, lengthText: String?) throws -> Resource? {
        guard let source = try attachmentFile(attachmentId: attachmentId, contentHash: contentHash, storageKey: storageKey)
            else { return nil }
        guard let offsetText, let lengthText, !offsetText.isEmpty, !lengthText.isEmpty,
              offsetText.allSatisfy(\.isNumber), lengthText.allSatisfy(\.isNumber),
              let offset = Int(offsetText), let length = Int(lengthText),
              offset >= 0, offset % attachmentRangeBytes == 0,
              offset < source.size || offset == 0 && source.size == 0,
              length > 0, length <= attachmentRangeBytes,
              length == attachmentRangeBytes || length == source.size - offset
              else { throw invalid("invalid_request") }
        let body = try readAttachmentRange(source.url, offset: offset,
            count: min(length, source.size - offset))
        return Resource(body: body, contentType: source.mimeType, totalBytes: source.size)
    }

    static func readAttachmentRange(_ url: URL, offset: Int, count: Int) throws -> Data {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(offset))
        let body = try handle.read(upToCount: count) ?? Data()
        guard body.count == count else { throw invalid("attachment_resource_range_invalid") }
        return body
    }

    static func contentBlobBatch(snapshot: URL, requestData: Data) throws -> Resource {
        let value = try JSONSerialization.jsonObject(with: requestData) as? [String: Any]
        guard let hashes = value?["hashes"] as? [String], hashes.count <= 32,
              Set(hashes).count == hashes.count,
              hashes.allSatisfy({ $0.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil }) else {
            throw invalid("invalid_hashes")
        }
        guard try contentBlobBatchBytes(snapshot: snapshot, hashes: hashes) <= 2 * 1024 * 1024 else {
            throw invalid("content_blob_batch_exceeds_budget")
        }
        let boundary = "foliole-content-blobs-" + String(hashes.joined().prefix(24))
        var output = Data()
        for hash in hashes {
            guard let resource = try contentBlob(snapshot: snapshot, hash: hash) else { continue }
            output.append(Data("--\(boundary)\r\nContent-Type: \(resource.contentType)\r\nContent-Length: \(resource.body.count)\r\nX-Blob-Hash: \(hash)\r\n\r\n".utf8))
            output.append(resource.body); output.append(Data("\r\n".utf8))
        }
        output.append(Data("--\(boundary)--\r\n".utf8))
        return Resource(body: output, contentType: "multipart/mixed; boundary=\(boundary)")
    }

    private static func contentBlobBatchBytes(snapshot: URL, hashes: [String]) throws -> Int64 {
        if hashes.isEmpty { return 0 }
        var database: OpaquePointer?, statement: OpaquePointer?
        guard sqlite3_open_v2(snapshot.path, &database, SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK,
              let database else { throw invalid("sync_group_snapshot_open_failed") }
        defer { sqlite3_close(database) }
        let placeholders = Array(repeating: "?", count: hashes.count).joined(separator: ",")
        let sql = "SELECT COALESCE(SUM(length(data)), 0) FROM content_blob_data WHERE hash IN (\(placeholders))"
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw invalid("sync_group_resource_query_failed")
        }
        defer { sqlite3_finalize(statement) }
        for (offset, hash) in hashes.enumerated() {
            sqlite3_bind_text(statement, Int32(offset + 1), hash, -1, transient)
        }
        guard sqlite3_step(statement) == SQLITE_ROW else { throw invalid("sync_group_resource_query_failed") }
        return sqlite3_column_int64(statement, 0)
    }

    private static func query(_ url: URL, _ sql: String, _ values: [String]) throws -> (String?, Data)? {
        var database: OpaquePointer?, statement: OpaquePointer?
        guard sqlite3_open_v2(url.path, &database, SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK,
              let database else { throw invalid("sync_group_snapshot_open_failed") }
        defer { sqlite3_close(database) }
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw invalid("sync_group_resource_query_failed")
        }
        defer { sqlite3_finalize(statement) }
        for (offset, value) in values.enumerated() { sqlite3_bind_text(statement, Int32(offset + 1), value, -1, transient) }
        guard sqlite3_step(statement) == SQLITE_ROW else { return nil }
        let text = sqlite3_column_text(statement, 0).map { String(cString: $0) }
        let count = Int(sqlite3_column_bytes(statement, 1))
        let data = sqlite3_column_blob(statement, 1).map { Data(bytes: $0, count: count) } ?? Data()
        return (text, data)
    }

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncGroupResources", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}
