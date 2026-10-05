import CryptoKit
import Foundation
import FolioleFramedSyncRuntime
import SQLite3

// sql-surface: ios-isolated-snapshot-owner
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

enum FolioleCompanionFramedSyncInventory {
    static func read(_ snapshot: URL) throws -> [Foliole_Sync_V22_InventoryEntry] {
        let database = try FolioleReadOnlySQLite(url: snapshot)
        let parents = try related(database.rows("""
            SELECT version.object_id, parent.version_id, parent.parent_version_id, parent.ordinal
            FROM node_sync_version_parents parent JOIN node_sync_versions version
              ON version.version_id = parent.version_id
            ORDER BY version.object_id, parent.version_id, parent.ordinal, parent.parent_version_id
            """), parent: true)
        let reviews = try related(database.rows(
            "SELECT node_id, op_id FROM review_log ORDER BY node_id, op_id"), parent: false)
        let rows = try database.rows("""
            SELECT node.id, node.current_version_id, version.body_text, version.content_hash
            FROM nodes node JOIN node_sync_versions version ON version.version_id = node.current_version_id
            ORDER BY node.id LIMIT 4097
            """)
        guard rows.count <= 4_096 else { throw invalid("inventory_entry_limit_exceeded") }
        return try rows.map { row in
            let nodeID = row[0] ?? "", body = row[2] ?? ""
            var entry = Foliole_Sync_V22_InventoryEntry()
            entry.objectType = "node"; entry.globalID = nodeID
            entry.sharedStateHash = try digest(row[3] ?? "")
            entry.frontierFactIds = [row[1] ?? ""]
            entry.requiredRelationIds = parents[nodeID] ?? []
            entry.reviewFactIds = reviews[nodeID] ?? []
            entry.resourceHashes = [Data(SHA256.hash(data: Data(body.utf8)))]
            return entry
        }
    }

    private static func related(
        _ rows: [[String?]], parent: Bool
    ) throws -> [String: [String]] {
        try rows.reduce(into: [String: [String]]()) { result, row in
            let owner = row[0] ?? "", value: String
            if parent {
                let tuple: [Any] = [row[1] ?? "", row[2] ?? "", Int64(row[3] ?? "") ?? 0]
                value = String(data: try JSONSerialization.data(withJSONObject: tuple), encoding: .utf8) ?? ""
            } else { value = row[1] ?? "" }
            result[owner, default: []].append(value)
        }
    }

    private static func digest(_ value: String) throws -> Data {
        guard value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw invalid("framed_sync_inventory_state_hash_invalid")
        }
        var result = Data(capacity: 32)
        for offset in stride(from: 0, to: value.count, by: 2) {
            let start = value.index(value.startIndex, offsetBy: offset)
            result.append(UInt8(value[start..<value.index(start, offsetBy: 2)], radix: 16)!)
        }
        return result
    }

    private static func invalid(_ code: String) -> FolioleFramedSyncValidationError {
        FolioleFramedSyncValidationError(code)
    }
}
