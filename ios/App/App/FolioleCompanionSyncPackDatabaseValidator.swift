import Foundation

enum FolioleCompanionSyncPackDatabaseValidator {
    static func validate(
        databaseURL: URL,
        prepared: FoliolePreparedSyncPack,
        contract: FolioleCompanionSyncPackContract
    ) throws {
        do {
            let database = try FolioleReadOnlySQLite(url: databaseURL)
            try requireQuickCheck(database)
            try requireTablesAndColumns(database, requirements: contract.sqliteTableRequirements)
            try requireRowCounts(database, expected: prepared.rowCounts)
            try requireInnerManifest(database, outer: prepared.manifest)
        } catch let error as NSError where error.domain == "FolioleSyncPack" {
            throw error
        } catch {
            throw FolioleCompanionSyncPackEnvelopeValidator.invalid("invalid_sync_pack_sqlite", cause: error)
        }
    }

    private static func requireQuickCheck(_ database: FolioleReadOnlySQLite) throws {
        let rows = try database.rows("PRAGMA quick_check(1)")
        guard rows.count == 1, rows[0].first == "ok" else { throw invalid("invalid_sync_pack_quick_check") }
    }

    private static func requireTablesAndColumns(
        _ database: FolioleReadOnlySQLite,
        requirements: [String: Set<String>]
    ) throws {
        for (table, required) in requirements {
            let columns = Set(try database.rows("PRAGMA table_info(\(quote(table)))").compactMap { row in
                row.count > 1 ? row[1] : nil
            })
            guard columns.isSuperset(of: required) else {
                throw invalid("invalid_sync_pack_table_structure:\(table)")
            }
        }
    }

    private static func requireRowCounts(
        _ database: FolioleReadOnlySQLite,
        expected: [String: Int]
    ) throws {
        for (table, count) in expected {
            let rows = try database.rows("SELECT COUNT(*) FROM \(quote(table))")
            guard rows.count == 1, rows[0].first.flatMap({ $0 }).flatMap(Int.init) == count else {
                throw invalid("invalid_sync_pack_row_count:\(table)")
            }
        }
    }

    private static func requireInnerManifest(
        _ database: FolioleReadOnlySQLite,
        outer: [String: Any]
    ) throws {
        let rows = try database.rows(
            "SELECT value FROM pack_manifest WHERE key = ?",
            arguments: ["manifest_json"]
        )
        guard rows.count == 1, let value = rows[0][0], let data = value.data(using: .utf8),
              let inner = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw invalid("missing_sync_pack_inner_manifest")
        }
        guard try comparableManifest(inner) == comparableManifest(outer) else {
            throw invalid("sync_pack_inner_manifest_mismatch")
        }
    }

    private static func comparableManifest(_ value: [String: Any]) throws -> String {
        let packId = try FolioleCompanionSyncPackEnvelopeValidator.string(value, "pack_id")
        let from = try FolioleCompanionSyncPackEnvelopeValidator.integer(value, "from_state_seq")
        let to = try FolioleCompanionSyncPackEnvelopeValidator.integer(value, "to_state_seq")
        let tables = try FolioleCompanionSyncPackEnvelopeValidator.tableCounts(value)
        return "\(packId)|\(from)|\(to)|\(tables.sorted { $0.key < $1.key })"
    }

    private static func quote(_ identifier: String) throws -> String {
        guard identifier.range(of: "^[A-Za-z_][A-Za-z0-9_]*$", options: .regularExpression) != nil else {
            throw invalid("invalid_sync_pack_contract_identifier")
        }
        return "\"\(identifier)\""
    }

    private static func invalid(_ code: String) -> NSError {
        FolioleCompanionSyncPackEnvelopeValidator.invalid(code)
    }
}
