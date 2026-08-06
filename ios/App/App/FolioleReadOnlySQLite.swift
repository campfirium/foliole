import Foundation
import SQLite3

final class FolioleReadOnlySQLite {
    enum Binding {
        case integer(Int)
        case string(String)
    }

    private var database: OpaquePointer?

    init(url: URL) throws {
        let status = sqlite3_open_v2(url.path, &database, SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX, nil)
        guard status == SQLITE_OK else {
            let message = database.map { String(cString: sqlite3_errmsg($0)) } ?? "open failed"
            if let database { sqlite3_close(database) }
            throw Self.error(message)
        }
    }

    deinit {
        if let database { sqlite3_close(database) }
    }

    func rows(_ sql: String, arguments: [String] = []) throws -> [[String?]] {
        try rows(sql, bindings: arguments.map(Binding.string))
    }

    func rows(_ sql: String, bindings: [Binding]) throws -> [[String?]] {
        guard let database else { throw Self.error("database closed") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw Self.error(String(cString: sqlite3_errmsg(database)))
        }
        defer { sqlite3_finalize(statement) }
        try bind(bindings, statement: statement)
        var result: [[String?]] = []
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { return result }
            guard status == SQLITE_ROW else { throw Self.error(String(cString: sqlite3_errmsg(database))) }
            result.append((0..<sqlite3_column_count(statement)).map { index in
                sqlite3_column_text(statement, index).map { String(cString: $0) }
            })
        }
    }

    private func bind(_ bindings: [Binding], statement: OpaquePointer) throws {
        for (offset, binding) in bindings.enumerated() {
            let index = Int32(offset + 1)
            let status: Int32
            switch binding {
            case .integer(let value): status = sqlite3_bind_int64(statement, index, sqlite3_int64(value))
            case .string(let value): status = sqlite3_bind_text(statement, index, value, -1, Self.transient)
            }
            guard status == SQLITE_OK else { throw Self.error("bind failed") }
        }
    }

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private static func error(_ message: String) -> NSError {
        NSError(domain: "FolioleReadOnlySQLite", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
