import Foundation
import FolioleFramedSyncRuntime
import SQLite3

// sql-surface: ios-isolated-framed-staging-owner
final class FolioleFramedSyncTransferDatabase {
    let url: URL
    private var database: OpaquePointer?

    init(url: URL) throws {
        self.url = url
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard sqlite3_open_v2(url.path, &database,
                              SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK,
              let database else { throw invalid("framed_sync_database_open_failed") }
        sqlite3_busy_timeout(database, 5_000)
        try execute("PRAGMA foreign_keys = ON")
        try FolioleFramedSyncTransferSchema.install(self)
        try FolioleFramedSyncCompletedInboundCleanup.migratePayloads(database: self)
        try FolioleFramedSyncCompletedInboundCleanup.recover(database: self)
    }

    deinit { if let database { sqlite3_close(database) } }

    func transaction<T>(_ operation: () throws -> T) throws -> T {
        try execute("BEGIN IMMEDIATE")
        do { let value = try operation(); try execute("COMMIT"); return value }
        catch { try? execute("ROLLBACK"); throw error }
    }

    func execute(_ sql: String, _ values: [Any] = []) throws {
        let statement = try prepare(sql, values)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw databaseError() }
    }

    func rows(_ sql: String, _ values: [Any] = []) throws -> [[Any?]] {
        let statement = try prepare(sql, values)
        defer { sqlite3_finalize(statement) }
        var result = [[Any?]]()
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { return result }
            guard status == SQLITE_ROW else { throw databaseError() }
            result.append((0..<sqlite3_column_count(statement)).map { column(statement, $0) })
        }
    }

    private func prepare(_ sql: String, _ values: [Any]) throws -> OpaquePointer {
        guard let database else { throw invalid("framed_sync_database_closed") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
              let statement else { throw databaseError() }
        for (offset, value) in values.enumerated() { bind(value, statement, Int32(offset + 1)) }
        return statement
    }

    private func bind(_ value: Any, _ statement: OpaquePointer, _ index: Int32) {
        if let value = value as? String { sqlite3_bind_text(statement, index, value, -1, Self.transient) }
        else if let value = value as? Int { sqlite3_bind_int64(statement, index, sqlite3_int64(value)) }
        else if let value = value as? UInt64 { sqlite3_bind_int64(statement, index, sqlite3_int64(bitPattern: value)) }
        else if let value = value as? Data {
            _ = value.withUnsafeBytes { sqlite3_bind_blob(statement, index, $0.baseAddress, Int32(value.count), Self.transient) }
        } else { sqlite3_bind_null(statement, index) }
    }

    private func column(_ statement: OpaquePointer, _ index: Int32) -> Any? {
        switch sqlite3_column_type(statement, index) {
        case SQLITE_INTEGER: return Int(sqlite3_column_int64(statement, index))
        case SQLITE_TEXT: return sqlite3_column_text(statement, index).map { String(cString: $0) }
        case SQLITE_BLOB:
            let count = Int(sqlite3_column_bytes(statement, index))
            return sqlite3_column_blob(statement, index).map { Data(bytes: $0, count: count) } ?? Data()
        default: return nil
        }
    }

    private func databaseError() -> FolioleFramedSyncValidationError {
        let message = database.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown"
        return invalid("framed_sync_database_error:\(message)")
    }

    private func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
}

enum FolioleFramedSyncTransferSchema {
    static func install(_ db: FolioleFramedSyncTransferDatabase) throws {
        for sql in statements { try db.execute(sql) }
    }

    private static let statements = [
        """
        CREATE TABLE IF NOT EXISTS framed_sync_ios_transfers (
        transfer_id BLOB PRIMARY KEY, content_id BLOB NOT NULL, fact_count INTEGER NOT NULL,
        blob_count INTEGER NOT NULL, total_blob_bytes INTEGER NOT NULL,
        sender_device_id TEXT NOT NULL, sender_library_epoch TEXT NOT NULL,
        receiver_device_id TEXT NOT NULL, receiver_library_epoch TEXT NOT NULL,
        active_attempt_id BLOB NOT NULL, state TEXT NOT NULL)
        """,
        """
        CREATE TABLE IF NOT EXISTS framed_sync_ios_frames (
        transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sequence TEXT NOT NULL,
        frame_type INTEGER NOT NULL, preamble BLOB NOT NULL, frame_header BLOB NOT NULL,
        ciphertext BLOB NOT NULL, authenticated_plaintext BLOB NOT NULL,
        PRIMARY KEY (transfer_id, attempt_id, sequence))
        """,
        """
        CREATE TABLE IF NOT EXISTS framed_sync_ios_available_blobs (
        sha256 BLOB PRIMARY KEY, byte_length INTEGER NOT NULL, data BLOB NOT NULL)
        """,
        """
        CREATE TABLE IF NOT EXISTS framed_sync_ios_blob_pins (
        transfer_id BLOB NOT NULL, sha256 BLOB NOT NULL, byte_length INTEGER NOT NULL,
        role INTEGER NOT NULL, required INTEGER NOT NULL, PRIMARY KEY (transfer_id, sha256))
        """,
        """
        CREATE TABLE IF NOT EXISTS framed_sync_ios_blob_offers (
        transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sha256 BLOB NOT NULL,
        byte_length INTEGER NOT NULL, role INTEGER NOT NULL, required INTEGER NOT NULL,
        PRIMARY KEY (transfer_id, attempt_id, sha256))
        """,
        """
        CREATE TABLE IF NOT EXISTS framed_sync_ios_resource_blob_chunks (
        transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sha256 BLOB NOT NULL,
        byte_offset INTEGER NOT NULL, byte_length INTEGER NOT NULL, chunk_sha256 BLOB NOT NULL,
        PRIMARY KEY (transfer_id, attempt_id, sha256, byte_offset))
        """,
        """
        CREATE TABLE IF NOT EXISTS framed_sync_ios_available_resources (
        sha256 BLOB PRIMARY KEY, byte_length INTEGER NOT NULL, storage_key TEXT NOT NULL)
        """,
        """
        CREATE TABLE IF NOT EXISTS framed_sync_ios_resource_pins (
        transfer_id BLOB NOT NULL, sha256 BLOB NOT NULL, byte_length INTEGER NOT NULL,
        role INTEGER NOT NULL, required INTEGER NOT NULL, storage_key TEXT NOT NULL,
        PRIMARY KEY (transfer_id, sha256))
        """,
        """
        CREATE TABLE IF NOT EXISTS framed_sync_ios_receipts (
        transfer_id BLOB PRIMARY KEY, content_id BLOB NOT NULL,
        receiver_device_id TEXT NOT NULL, receiver_library_epoch TEXT NOT NULL,
        applied_state_hash BLOB NOT NULL)
        """,
        """
        CREATE TABLE IF NOT EXISTS framed_sync_ios_receipt_attempts (
        transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, preamble BLOB NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('prepared','replayable')),
        PRIMARY KEY (transfer_id, attempt_id))
        """,
        """
        CREATE TABLE IF NOT EXISTS framed_sync_ios_receipt_frames (
        transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sequence TEXT NOT NULL,
        frame_header BLOB NOT NULL, ciphertext BLOB NOT NULL, authenticated_plaintext BLOB NOT NULL,
        PRIMARY KEY (transfer_id, attempt_id, sequence))
        """,
        """
        CREATE TABLE IF NOT EXISTS framed_sync_ios_outbound_attempts (
        transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, preamble BLOB NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('prepared','replayable')),
        PRIMARY KEY (transfer_id, attempt_id))
        """,
        """
        CREATE TABLE IF NOT EXISTS framed_sync_ios_outbound_frames (
        transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sequence TEXT NOT NULL,
        frame_header BLOB NOT NULL, ciphertext BLOB NOT NULL, authenticated_plaintext BLOB NOT NULL,
        PRIMARY KEY (transfer_id, attempt_id, sequence),
        FOREIGN KEY (transfer_id, attempt_id) REFERENCES framed_sync_ios_outbound_attempts
        (transfer_id, attempt_id) ON DELETE CASCADE)
        """
    ]
}
