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
    static func read(_ value: [String: Any]) throws -> [Foliole_Sync_V22_InventoryEntry] {
        guard let rows = value["entries"] as? [[String: Any]], rows.count <= FolioleFramedSyncLimits.maxInventoryEntries else {
            throw invalid("inventory_input_invalid")
        }
        return try rows.map { row in
            var entry = Foliole_Sync_V22_InventoryEntry()
            entry.objectType = try text(row, "object_type")
            entry.globalID = try text(row, "global_id")
            entry.sharedStateHash = try digest(text(row, "shared_state_hash"))
            entry.frontierFactIds = try strings(row, "frontier_fact_ids")
            entry.requiredRelationIds = try strings(row, "required_relation_ids")
            entry.reviewFactIds = try strings(row, "review_fact_ids")
            entry.stateFactIds = try strings(row, "state_fact_ids")
            entry.resourceHashes = try strings(row, "resource_hashes").map(digest)
            return entry
        }
    }

    private static func text(_ row: [String: Any], _ key: String) throws -> String {
        guard let value = row[key] as? String,
              !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw invalid("inventory_identity_required")
        }
        return value
    }

    private static func strings(_ row: [String: Any], _ key: String) throws -> [String] {
        guard let values = row[key] as? [String], values.allSatisfy({ !$0.isEmpty }) else {
            throw invalid("inventory_input_invalid")
        }
        return values
    }

    private static func digest(_ value: String) throws -> Data {
        guard value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw invalid("framed_sync_inventory_digest_invalid")
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
