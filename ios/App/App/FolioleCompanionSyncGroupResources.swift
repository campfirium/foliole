import Foundation
import SQLite3

enum FolioleCompanionSyncGroupResources {
    struct Resource { let body: Data; let contentType: String }

    static func contentBlob(snapshot: URL, hash: String?) throws -> Resource? {
        guard let hash, hash.range(of: "^[a-fA-F0-9]{64}$", options: .regularExpression) != nil else { return nil }
        return try query(snapshot,
            "SELECT cb.mime_type, cbd.data FROM content_blobs cb JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cb.hash = ?",
            [hash.lowercased()]).map { Resource(body: $0.1, contentType: $0.0 ?? "application/octet-stream") }
    }

    static func attachment(snapshot: URL, attachmentId: String?, contentHash: String?) throws -> Resource? {
        guard let attachmentId, !attachmentId.isEmpty, let contentHash,
              contentHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              let row = try query(snapshot,
                "SELECT mime_type, CAST(storage_key AS BLOB) FROM attachment_blobs WHERE attachment_id = ? AND content_hash = ?",
                [attachmentId, contentHash]), String(data: row.1, encoding: .utf8) == contentHash else { return nil }
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                  appropriateFor: nil, create: false)
        let candidates = ["attachments", "foliole-attachments"].map {
            support.appendingPathComponent($0, isDirectory: true).appendingPathComponent(contentHash)
        }
        guard let url = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }) else { return nil }
        return Resource(body: try Data(contentsOf: url), contentType: row.0 ?? "application/octet-stream")
    }

    static func contentBlobBatch(snapshot: URL, requestData: Data) throws -> Resource {
        let value = try JSONSerialization.jsonObject(with: requestData) as? [String: Any]
        guard let hashes = value?["hashes"] as? [String], hashes.count <= 32,
              hashes.allSatisfy({ $0.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil }) else {
            throw invalid("invalid_hashes")
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
