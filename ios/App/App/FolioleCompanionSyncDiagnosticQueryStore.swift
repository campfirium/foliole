import Foundation
import SQLite3

struct FolioleCompanionDiagnosticQuery {
    let columns: [(key: String, type: String)]
    let sql: String
}

final class FolioleCompanionSyncDiagnosticQueryStore {
    private var database: OpaquePointer?
    private let queries: [String: FolioleCompanionDiagnosticQuery]

    init(databaseURL: URL, bundle: Bundle = .main) throws {
        queries = try Self.loadQueries(bundle: bundle)
        let flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(databaseURL.path, &database, flags, nil) == SQLITE_OK, let database else {
            throw Self.error("Unable to open the companion database for diagnostics.")
        }
        sqlite3_busy_timeout(database, 5_000)
        guard sqlite3_exec(database, "PRAGMA query_only = ON", nil, nil, nil) == SQLITE_OK else {
            throw Self.error("Unable to protect the diagnostic database connection.")
        }
    }

    deinit { if let database { sqlite3_close(database) } }

    func rows(_ name: String, arguments: [String] = []) throws -> [[String: Any]] {
        guard let query = queries[name], let database else { throw Self.error("Missing diagnostic query: \(name)") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, query.sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw Self.error(message())
        }
        defer { sqlite3_finalize(statement) }
        try bind(arguments, statement)
        var result: [[String: Any]] = []
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { return result }
            guard status == SQLITE_ROW else { throw Self.error(message()) }
            result.append(row(statement, columns: query.columns))
        }
    }

    func metrics(_ name: String) throws -> [String: Int] {
        try rows(name).reduce(into: [:]) { result, row in
            guard let key = row["metric"] as? String, let value = row["value"] as? Int else { return }
            result[key] = value
        }
    }

    func meta(_ key: String) throws -> String? {
        try rows("companionMetaValue", arguments: [key]).first?["value"] as? String
    }

    private func bind(_ values: [String], _ statement: OpaquePointer) throws {
        for (offset, value) in values.enumerated() {
            guard sqlite3_bind_text(statement, Int32(offset + 1), value, -1, Self.transient) == SQLITE_OK else {
                throw Self.error("Unable to bind a diagnostic query value.")
            }
        }
    }

    private func row(_ statement: OpaquePointer, columns: [(key: String, type: String)]) -> [String: Any] {
        columns.enumerated().reduce(into: [:]) { result, entry in
            let index = Int32(entry.offset)
            let column = entry.element
            if sqlite3_column_type(statement, index) == SQLITE_NULL {
                result[column.key] = NSNull()
            } else if column.type == "long" {
                result[column.key] = Int(sqlite3_column_int64(statement, index))
            } else {
                result[column.key] = sqlite3_column_text(statement, index).map { String(cString: $0) } ?? ""
            }
        }
    }

    private func message() -> String { database.map { String(cString: sqlite3_errmsg($0)) } ?? "SQLite error" }

    private static func loadQueries(bundle: Bundle) throws -> [String: FolioleCompanionDiagnosticQuery] {
        guard let url = bundle.url(forResource: "companion-query-definitions", withExtension: "json") else {
            throw error("Missing companion query definitions.")
        }
        let root = try object(JSONSerialization.jsonObject(with: Data(contentsOf: url)), "query definitions")
        let values = try object(root["queries"], "queries")
        return try values.reduce(into: [:]) { result, entry in
            let definition = try object(entry.value, entry.key)
            guard let sql = definition["sql"] as? String, let rawColumns = definition["columns"] as? [Any] else { return }
            let columns = try rawColumns.map { raw -> (String, String) in
                let column = try object(raw, entry.key)
                guard let key = column["key"] as? String, let type = column["type"] as? String else {
                    throw error("Invalid diagnostic query column: \(entry.key)")
                }
                return (key, type)
            }
            result[entry.key] = FolioleCompanionDiagnosticQuery(columns: columns, sql: sql)
        }
    }

    private static func object(_ value: Any?, _ name: String) throws -> [String: Any] {
        guard let value = value as? [String: Any] else { throw error("Invalid \(name).") }
        return value
    }

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    private static func error(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncDiagnostics", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
