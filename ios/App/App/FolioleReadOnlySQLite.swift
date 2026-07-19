import Foundation
import SQLite3

final class FolioleReadOnlySQLite {
    private var database: OpaquePointer?

    init(url: URL) throws {
        let status = sqlite3_open_v2(url.path, &database, SQLITE_OPEN_READONLY, nil)
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
        guard let database else { throw Self.error("database closed") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw Self.error(String(cString: sqlite3_errmsg(database)))
        }
        defer { sqlite3_finalize(statement) }
        try bind(arguments, statement: statement)
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

    private func bind(_ arguments: [String], statement: OpaquePointer) throws {
        for (offset, value) in arguments.enumerated() {
            let status = sqlite3_bind_text(statement, Int32(offset + 1), value, -1, Self.transient)
            guard status == SQLITE_OK else { throw Self.error("bind failed") }
        }
    }

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private static func error(_ message: String) -> NSError {
        NSError(domain: "FolioleReadOnlySQLite", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

enum FolioleCompanionDatabaseLocation {
    static func mainDatabase(fileManager: FileManager = .default) throws -> URL {
        guard let library = fileManager.urls(for: .libraryDirectory, in: .userDomainMask).first else {
            throw NSError(domain: "FolioleDatabaseLocation", code: 1)
        }
        return library.appendingPathComponent("CapacitorDatabase/foliole-companionSQLite.db")
    }

    static func canonicalDeviceId() throws -> String {
        let database = try FolioleReadOnlySQLite(url: try mainDatabase())
        let rows = try database.rows("SELECT value FROM companion_meta WHERE key = ?", arguments: ["device_id"])
        guard rows.count == 1, let value = rows[0][0], !value.isEmpty else {
            throw NSError(
                domain: "FolioleDatabaseLocation",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Companion database device identity is unavailable."]
            )
        }
        return value
    }
}
