import Foundation
import SQLite3

// sql-surface: ios-isolated-pack-owner
enum FolioleCompanionContentBlobPack {
    static func create(parts: [FolioleCompanionContentBlobPart]) throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-content-packs", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let url = root.appendingPathComponent("\(UUID().uuidString).db")
        var database: OpaquePointer?
        guard sqlite3_open_v2(url.path, &database, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK,
              let database else { throw invalid("Content pack could not open.") }
        do {
            try execute(database, "CREATE TABLE content_blob_batch (hash TEXT PRIMARY KEY, size_bytes INTEGER NOT NULL, data BLOB NOT NULL)")
            try execute(database, "BEGIN IMMEDIATE")
            for part in parts { try insert(database, part) }
            try execute(database, "COMMIT")
            try assertIntegrity(database, expectedRows: parts.count)
            sqlite3_close(database)
            return url
        } catch {
            _ = try? execute(database, "ROLLBACK")
            sqlite3_close(database)
            try? FileManager.default.removeItem(at: url)
            throw error
        }
    }

    static func read(_ url: URL) throws -> [FolioleCompanionContentBlobPart] {
        var database: OpaquePointer?
        guard sqlite3_open_v2(url.path, &database, SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK,
              let database else { throw invalid("Content pack could not open.") }
        defer { sqlite3_close(database) }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, "SELECT hash, data FROM content_blob_batch ORDER BY hash", -1, &statement, nil) == SQLITE_OK,
              let statement else { throw invalid("Content pack query failed.") }
        defer { sqlite3_finalize(statement) }
        var parts: [FolioleCompanionContentBlobPart] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            guard let text = sqlite3_column_text(statement, 0) else { throw invalid("Content pack hash is missing.") }
            let count = Int(sqlite3_column_bytes(statement, 1))
            let data = sqlite3_column_blob(statement, 1).map { Data(bytes: $0, count: count) } ?? Data()
            parts.append(.init(data: data, hash: String(cString: text)))
        }
        return parts
    }

    private static func insert(_ database: OpaquePointer, _ part: FolioleCompanionContentBlobPart) throws {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, "INSERT INTO content_blob_batch VALUES (?, ?, ?)", -1, &statement, nil) == SQLITE_OK,
              let statement else { throw invalid("Content pack insert failed.") }
        defer { sqlite3_finalize(statement) }
        sqlite3_bind_text(statement, 1, part.hash, -1, transient)
        sqlite3_bind_int64(statement, 2, sqlite3_int64(part.data.count))
        let status = part.data.withUnsafeBytes { bytes in sqlite3_bind_blob(statement, 3, bytes.baseAddress, Int32(bytes.count), transient) }
        guard status == SQLITE_OK, sqlite3_step(statement) == SQLITE_DONE else { throw invalid("Content pack insert failed.") }
    }

    private static func assertIntegrity(_ database: OpaquePointer, expectedRows: Int) throws {
        guard try scalarText(database, "PRAGMA quick_check") == "ok",
              try scalarInt(database, "SELECT COUNT(*) FROM content_blob_batch") == expectedRows else {
            throw invalid("Content pack failed SQLite validation.")
        }
    }

    private static func execute(_ database: OpaquePointer, _ sql: String) throws {
        guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else { throw invalid("Content pack write failed.") }
    }
    private static func scalarText(_ database: OpaquePointer, _ sql: String) throws -> String? {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw invalid("Content pack query failed.")
        }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW else { return nil }
        return sqlite3_column_text(statement, 0).map { String(cString: $0) }
    }
    private static func scalarInt(_ database: OpaquePointer, _ sql: String) throws -> Int {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw invalid("Content pack query failed.")
        }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW else { return -1 }
        return Int(sqlite3_column_int64(statement, 0))
    }
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionContentBlobPack", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
