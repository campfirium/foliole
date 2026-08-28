import Foundation
import SQLite3

// sql-surface: ios-isolated-pack-owner
final class FolioleCompanionSyncPackSQLite {
    private(set) var database: OpaquePointer?
    init(url: URL, create: Bool) throws {
        let flags = (create ? SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE : SQLITE_OPEN_READONLY) | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(url.path, &database, flags, nil) == SQLITE_OK, database != nil else {
            throw Self.invalid("sync_pack_database_open_failed")
        }
    }
    deinit { if let database { sqlite3_close(database) } }

    func execute(_ sql: String, bindings: [Int] = []) throws {
        guard let database else { throw Self.invalid("sync_pack_database_closed") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw error() }
        defer { sqlite3_finalize(statement) }
        for (index, value) in bindings.enumerated() { sqlite3_bind_int64(statement, Int32(index + 1), sqlite3_int64(value)) }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw error() }
    }

    func attach(_ url: URL) throws { try execute("ATTACH DATABASE '\(url.path.replacingOccurrences(of: "'", with: "''"))' AS source") }
    func scalar(_ sql: String) throws -> Int {
        try rows(sql).first?.first.flatMap { ($0 as? NSNumber)?.intValue } ?? 0
    }

    func rows(_ sql: String) throws -> [[Any?]] {
        guard let database else { throw Self.invalid("sync_pack_database_closed") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw error() }
        defer { sqlite3_finalize(statement) }
        var result: [[Any?]] = []
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { return result }
            guard status == SQLITE_ROW else { throw error() }
            result.append((0..<sqlite3_column_count(statement)).map { value(statement, $0) })
        }
    }

    func namedRows(_ sql: String) throws -> [[String: Any]] {
        guard let database else { throw Self.invalid("sync_pack_database_closed") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw error() }
        defer { sqlite3_finalize(statement) }
        var result: [[String: Any]] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            var row: [String: Any] = [:]
            for index in 0..<sqlite3_column_count(statement) {
                let name = String(cString: sqlite3_column_name(statement, index))
                row[name] = value(statement, index) ?? NSNull()
            }
            result.append(row)
        }
        return result
    }

    func insertSyncObject(_ values: [Any?]) throws {
        guard let database else { throw Self.invalid("sync_pack_database_closed") }
        var statement: OpaquePointer?
        let sql = "INSERT INTO sync_objects VALUES (?, ?, ?, ?, ?, ?)"
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw error() }
        defer { sqlite3_finalize(statement) }
        for (offset, value) in values.enumerated() { bind(value, statement, Int32(offset + 1)) }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw error() }
    }

    private func value(_ statement: OpaquePointer, _ index: Int32) -> Any? {
        switch sqlite3_column_type(statement, index) {
        case SQLITE_INTEGER: return NSNumber(value: sqlite3_column_int64(statement, index))
        case SQLITE_FLOAT: return NSNumber(value: sqlite3_column_double(statement, index))
        case SQLITE_TEXT: return sqlite3_column_text(statement, index).map { String(cString: $0) }
        case SQLITE_BLOB:
            let count = Int(sqlite3_column_bytes(statement, index))
            return sqlite3_column_blob(statement, index).map { Data(bytes: $0, count: count) }
        default: return nil
        }
    }

    private func bind(_ value: Any?, _ statement: OpaquePointer, _ index: Int32) {
        if let text = value as? String { sqlite3_bind_text(statement, index, text, -1, Self.transient) }
        else if let number = value as? NSNumber { sqlite3_bind_int64(statement, index, number.int64Value) }
        else { sqlite3_bind_null(statement, index) }
    }
    private func error() -> NSError {
        Self.invalid(database.map { String(cString: sqlite3_errmsg($0)) } ?? "sync_pack_sql_failed")
    }
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncPackSQLite", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
