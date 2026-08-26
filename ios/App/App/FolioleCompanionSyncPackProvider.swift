import Foundation

enum FolioleCompanionSyncPackProvider {
    struct Result { let body: Data; let toSequence: Int }

    static func build(snapshot: URL, fromDevice: String, toDevice: String, fromSequence: Int) throws -> Result {
        let definitions = try FolioleCompanionSyncPackProviderDefinitions.load()
        try definitions.validate()
        let packURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-provider-\(UUID().uuidString).db")
        defer { try? FileManager.default.removeItem(at: packURL) }
        let packId = UUID().uuidString.lowercased()
        let toSequence = try createDatabase(packURL, snapshot, definitions, fromSequence, packId)
        let database = try Data(contentsOf: packURL), compressed = try FolioleCompanionSyncPackArchive.deflate(database)
        let tables = try tableManifest(packURL, definitions.tableNames)
        let manifest: [String: Any] = [
            "compression": definitions.compression, "created_at": ISO8601DateFormatter().string(from: Date()),
            "database_compressed_sha256": FolioleCompanionSyncPackArchive.sha256(compressed),
            "database_file": definitions.databaseEntry,
            "database_uncompressed_sha256": FolioleCompanionSyncPackArchive.sha256(database),
            "format": definitions.format, "format_version": definitions.formatVersion,
            "from_peer_id": fromDevice, "from_state_seq": fromSequence, "pack_id": packId,
            "schema_version": definitions.schemaVersion, "tables": tables,
            "to_peer_id": toDevice, "to_state_seq": toSequence
        ]
        let manifestData = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
        return Result(body: FolioleCompanionSyncPackArchive.zip(entries: [
            ("manifest.json", manifestData), (definitions.databaseEntry, compressed)
        ]), toSequence: toSequence)
    }

    private static func createDatabase(
        _ url: URL, _ snapshot: URL, _ definitions: FolioleCompanionSyncPackProviderDefinitions,
        _ from: Int, _ packId: String
    ) throws -> Int {
        let database = try FolioleCompanionSyncPackSQLite(url: url, create: true)
        try database.attach(snapshot)
        do {
            try database.execute("BEGIN")
            let to = try database.scalar("SELECT COALESCE(MAX(state_seq), 0) FROM source.sync_object_state")
            for sql in definitions.packSchema { try database.execute(sql) }
            for (index, sql) in definitions.copyStatements.enumerated() {
                if index == definitions.stateCopyIndex { try database.execute(sql, bindings: [from, to]) }
                else {
                    if index == definitions.payloadCopyIndex {
                        try FolioleCompanionSyncPackPayloadWriter.copy(database, plans: definitions.payloadPlans)
                    }
                    try database.execute(sql)
                }
            }
            let tables = try tableManifest(database, definitions.tableNames)
            let inner = try JSONSerialization.data(withJSONObject: [
                "from_state_seq": from, "pack_id": packId, "tables": tables, "to_state_seq": to
            ], options: [.sortedKeys])
            let escaped = String(decoding: inner, as: UTF8.self).replacingOccurrences(of: "'", with: "''")
            try database.execute("INSERT INTO pack_manifest (key, value) VALUES ('manifest_json', '\(escaped)')")
            try database.execute("COMMIT")
            try database.execute("DETACH DATABASE source")
            return to
        } catch {
            try? database.execute("ROLLBACK"); try? database.execute("DETACH DATABASE source")
            throw error
        }
    }

    private static func tableManifest(_ url: URL, _ names: [String]) throws -> [[String: Any]] {
        try tableManifest(FolioleCompanionSyncPackSQLite(url: url, create: false), names)
    }
    private static func tableManifest(
        _ database: FolioleCompanionSyncPackSQLite, _ names: [String]
    ) throws -> [[String: Any]] {
        try names.map { ["name": $0, "row_count": try database.scalar("SELECT COUNT(*) FROM \"\($0)\"")] }
    }
}
