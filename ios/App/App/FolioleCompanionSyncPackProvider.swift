import Foundation

enum FolioleCompanionSyncPackProvider {
    struct Result { let body: Data; let toSequence: Int; let holds: [String: Any] }

    static func build(snapshot: URL, fromDevice: String, toDevice: String, fromSequence: Int,
                      requestedFrontier: Int? = nil, requestedEpoch: String? = nil,
                      selectedTo: Int? = nil, expectedIndex: String? = nil,
                      versionBits: String? = nil, parentBits: String? = nil,
                      reviewBits: String? = nil) throws -> Result {
        let definitions = try FolioleCompanionSyncPackProviderDefinitions.load()
        try definitions.validate()
        let epoch = try readSourceEpoch(snapshot)
        guard requestedEpoch == nil || requestedEpoch == epoch else {
            throw NSError(domain: "sync_pack_source_epoch_changed", code: 1)
        }
        let source = try FolioleCompanionSyncPackSQLite(url: snapshot, create: false)
        let highWater = try source.scalar("SELECT high_water FROM sync_state_sequence WHERE singleton_id = 1")
        let frontier = requestedFrontier ?? highWater
        guard fromSequence >= 0, frontier >= fromSequence, frontier <= highWater else {
            throw NSError(domain: "sync_pack_frontier_unavailable", code: 1)
        }
        let candidates = try pageCandidates(source, from: fromSequence, frontier: frontier)
        if let expectedIndex {
            guard let selectedTo, selectedTo >= fromSequence, selectedTo <= frontier else {
                throw NSError(domain: "invalid_sync_pack_fact_request", code: 1)
            }
            guard let selected = try buildCandidate(snapshot: snapshot, definitions: definitions,
                fromDevice: fromDevice, toDevice: toDevice, from: fromSequence,
                to: selectedTo, frontier: frontier, epoch: epoch,
                expectedIndex: expectedIndex, versionBits: versionBits,
                parentBits: parentBits, reviewBits: reviewBits) else {
                throw NSError(domain: "sync_pack_object_requires_fragments", code: 1)
            }
            return selected
        }
        var index = candidates.count - 1
        while index >= 0 {
            if let page = try buildCandidate(snapshot: snapshot, definitions: definitions,
                fromDevice: fromDevice, toDevice: toDevice, from: fromSequence,
                to: candidates[index], frontier: frontier, epoch: epoch) { return page }
            index = index == 0 ? -1 : (index - 1) / 2
        }
        throw NSError(domain: "sync_pack_object_requires_fragments", code: 1)
    }

    private static func pageCandidates(_ source: FolioleCompanionSyncPackSQLite,
                                       from: Int, frontier: Int) throws -> [Int] {
        var values = try source.namedRows("SELECT DISTINCT state_seq FROM sync_object_state " +
            "WHERE state_seq > \(from) AND state_seq <= \(frontier) ORDER BY state_seq LIMIT 128")
            .compactMap { $0["state_seq"] as? Int }
        if values.count < 128 && values.last != frontier { values.append(frontier) }
        return values
    }

    private static func buildCandidate(snapshot: URL, definitions: FolioleCompanionSyncPackProviderDefinitions,
                                       fromDevice: String, toDevice: String, from: Int,
                                       to: Int, frontier: Int, epoch: String,
                                       expectedIndex: String? = nil, versionBits: String? = nil,
                                       parentBits: String? = nil, reviewBits: String? = nil) throws -> Result? {
        if expectedIndex == nil {
            if try sourceVersionsExceedBudget(snapshot, definitions, from: from, to: to) {
                return nil
            }
        }
        let packURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-provider-\(UUID().uuidString).db")
        defer { try? FileManager.default.removeItem(at: packURL) }
        let packId = UUID().uuidString.lowercased()
        try createDatabase(packURL, snapshot, definitions, from, to, frontier, epoch, packId)
        let holds = try versionHolds(packURL, packId, toDevice)
        if let expectedIndex {
            let pack = try FolioleCompanionSyncPackSQLite(url: packURL, create: true)
            let index = try FolioleCompanionSyncPackFactIndex.read(pack,
                from: from, to: to, frontier: frontier, epoch: epoch)
            try FolioleCompanionSyncPackFactIndex.retainMissing(pack, index: index,
                expectedId: expectedIndex, versions: versionBits ?? "",
                parents: parentBits ?? "", reviews: reviewBits ?? "")
            try rewriteManifest(pack, definitions.tableNames, packId, epoch, from, to, frontier)
        }
        let databaseSize = try packURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max
        guard databaseSize <= 4 * 1024 * 1024 else { return nil }
        let database = try Data(contentsOf: packURL), compressed = try FolioleCompanionSyncPackArchive.deflate(database)
        guard compressed.count <= FolioleCompanionSyncPackEnvelopeValidator.maximumTransferBytes else { return nil }
        let tables = try tableManifest(packURL, definitions.tableNames)
        let manifest: [String: Any] = [
            "compression": definitions.compression, "created_at": ISO8601DateFormatter().string(from: Date()),
            "database_compressed_sha256": FolioleCompanionSyncPackArchive.sha256(compressed),
            "database_file": definitions.databaseEntry,
            "database_uncompressed_sha256": FolioleCompanionSyncPackArchive.sha256(database),
            "format": definitions.format, "format_version": definitions.formatVersion,
            "source_epoch": epoch, "frontier_state_seq": frontier,
            "from_peer_id": fromDevice, "from_state_seq": from, "pack_id": packId,
            "schema_version": definitions.schemaVersion, "tables": tables,
            "to_peer_id": toDevice, "to_state_seq": to
        ]
        let manifestData = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
        let archive = FolioleCompanionSyncPackArchive.zip(entries: [
            ("manifest.json", manifestData), (definitions.databaseEntry, compressed)
        ])
        guard archive.count <= FolioleCompanionSyncPackEnvelopeValidator.maximumTransferBytes else { return nil }
        return Result(body: archive, toSequence: to, holds: holds)
    }

    private static func sourceVersionsExceedBudget(_ snapshot: URL,
                                                   _ definitions: FolioleCompanionSyncPackProviderDefinitions,
                                                   from: Int, to: Int) throws -> Bool {
        let source = try FolioleCompanionSyncPackSQLite(url: snapshot, create: false)
        let rows = try source.rows(definitions.versionPreflightSql, bindings: [from, to, from, to])
        guard let values = rows.first, values.count == 2,
              let count = values[0] as? NSNumber, let bytes = values[1] as? NSNumber else {
            throw NSError(domain: "sync_pack_source_preflight_failed", code: 1)
        }
        return count.int64Value > 128 || bytes.int64Value > 4 * 1024 * 1024
    }

    private static func versionHolds(_ url: URL, _ packId: String, _ peer: String) throws -> [String: Any] {
        let database = try FolioleCompanionSyncPackSQLite(url: url, create: false)
        let heads = try database.namedRows(
            "SELECT id AS object_id, current_version_id AS version_id FROM nodes WHERE current_version_id IS NOT NULL " +
            "UNION SELECT t.node_id AS object_id, t.version_id FROM node_sync_tombstones t " +
            "JOIN node_sync_versions v ON v.version_id = t.version_id AND v.object_id = t.node_id"
        )
        let versions = try database.namedRows(
            "SELECT object_id, version_id, body_text, snapshot_json FROM node_sync_versions"
        )
        let payloads = try versions.compactMap { row -> [String: Any]? in
            guard let objectId = row["object_id"] as? String,
                  let versionId = row["version_id"] as? String,
                  let text = row["snapshot_json"] as? String,
                  let snapshot = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any]
            else { throw NSError(domain: "FolioleCompanionSyncPackProvider", code: 1) }
            if row["body_text"] is NSNull && snapshot["content"] is NSNull { return nil }
            return ["object_id": objectId, "version_id": versionId]
        }
        return ["pack_id": packId, "peer_id": peer, "heads": heads, "payloads": payloads]
    }

    private static func readSourceEpoch(_ snapshot: URL) throws -> String {
        let database = try FolioleCompanionSyncPackSQLite(url: snapshot, create: false)
        let rows = try database.namedRows("SELECT source_epoch FROM sync_state_sequence WHERE singleton_id = 1")
        guard rows.count == 1, let value = rows[0]["source_epoch"] as? String, !value.isEmpty else {
            throw NSError(domain: "sync_pack_source_epoch_missing", code: 1)
        }
        return value
    }

    static func createDatabase(
        _ url: URL, _ snapshot: URL, _ definitions: FolioleCompanionSyncPackProviderDefinitions,
        _ from: Int, _ to: Int, _ frontier: Int, _ epoch: String, _ packId: String
    ) throws {
        let database = try FolioleCompanionSyncPackSQLite(url: url, create: true)
        try database.attach(snapshot)
        do {
            try database.execute("BEGIN")
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
            try FolioleCompanionSyncPackPayloadWriter.copyTopicTextBodies(database)
            let tables = try tableManifest(database, definitions.tableNames)
            let inner = try JSONSerialization.data(withJSONObject: [
                "source_epoch": epoch, "frontier_state_seq": frontier,
                "from_state_seq": from, "pack_id": packId, "tables": tables, "to_state_seq": to
            ], options: [.sortedKeys])
            let escaped = String(decoding: inner, as: UTF8.self).replacingOccurrences(of: "'", with: "''")
            try database.execute("INSERT INTO pack_manifest (key, value) VALUES ('manifest_json', '\(escaped)')")
            try database.execute("COMMIT")
            try database.execute("DETACH DATABASE source")
        } catch {
            try? database.execute("ROLLBACK"); try? database.execute("DETACH DATABASE source")
            throw error
        }
    }

    private static func tableManifest(_ url: URL, _ names: [String]) throws -> [[String: Any]] {
        try tableManifest(FolioleCompanionSyncPackSQLite(url: url, create: false), names)
    }
    private static func rewriteManifest(_ database: FolioleCompanionSyncPackSQLite,
                                        _ names: [String], _ packId: String, _ epoch: String,
                                        _ from: Int, _ to: Int, _ frontier: Int) throws {
        let tables = try tableManifest(database, names)
        let inner = try JSONSerialization.data(withJSONObject: [
            "source_epoch": epoch, "frontier_state_seq": frontier,
            "from_state_seq": from, "pack_id": packId, "tables": tables, "to_state_seq": to
        ], options: [.sortedKeys])
        try database.execute("UPDATE pack_manifest SET value = ? WHERE key = 'manifest_json'",
            values: [String(decoding: inner, as: UTF8.self)])
    }
    private static func tableManifest(
        _ database: FolioleCompanionSyncPackSQLite, _ names: [String]
    ) throws -> [[String: Any]] {
        try names.map { ["name": $0, "row_count": try database.scalar("SELECT COUNT(*) FROM \"\($0)\"")] }
    }
}
