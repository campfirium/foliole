import Foundation

/** Mechanical SQLite and archive adapter for an already validated global-ID page. */
enum FolioleCompanionSyncIdentityPackBuilder {
    static func build(snapshot: URL, page: [String: Any]) throws -> Data {
        let definitions = try FolioleCompanionSyncPackProviderDefinitions.load()
        try definitions.validate()
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-identity-pack-\(UUID().uuidString).db")
        defer { try? FileManager.default.removeItem(at: url) }
        let packId = UUID().uuidString.lowercased()
        let inner = try fill(url, snapshot, page, packId, definitions)
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max
        guard size <= 4 * 1024 * 1024 else { throw invalid("sync_identity_pack_page_over_budget") }
        let database = try Data(contentsOf: url)
        let compressed = try FolioleCompanionSyncPackArchive.deflate(database)
        guard let fromPeer = page["source_peer_id"] as? String,
              let toPeer = page["target_peer_id"] as? String else {
            throw invalid("sync_identity_pack_page_invalid")
        }
        var outer = inner
        outer.merge([
            "format": definitions.format, "format_version": 21,
            "from_peer_id": fromPeer, "to_peer_id": toPeer,
            "schema_version": definitions.schemaVersion, "compression": "zlib",
            "database_file": definitions.databaseEntry,
            "database_uncompressed_sha256": FolioleCompanionSyncPackArchive.sha256(database),
            "database_compressed_sha256": FolioleCompanionSyncPackArchive.sha256(compressed),
            "created_at": ISO8601DateFormatter().string(from: Date())
        ]) { _, new in new }
        let manifest = try JSONSerialization.data(withJSONObject: outer, options: [.sortedKeys])
        let archive = FolioleCompanionSyncPackArchive.zip(entries: [
            ("manifest.json", manifest), (definitions.databaseEntry, compressed)
        ])
        guard archive.count <= FolioleCompanionSyncPackEnvelopeValidator.maximumTransferBytes else {
            throw invalid("sync_identity_pack_page_over_budget")
        }
        return archive
    }

    private static func fill(
        _ url: URL, _ snapshot: URL, _ page: [String: Any], _ packId: String,
        _ definitions: FolioleCompanionSyncPackProviderDefinitions
    ) throws -> [String: Any] {
        let database = try FolioleCompanionSyncPackSQLite(url: url, create: true)
        try database.attach(snapshot)
        do {
            try database.execute("BEGIN")
            for sql in definitions.packSchema { try database.execute(sql) }
            try database.execute("ALTER TABLE sync_object_state ADD COLUMN current_version_id TEXT")
            try database.execute("CREATE TEMP TABLE selected_identity_objects " +
                "(object_type TEXT NOT NULL, object_id TEXT NOT NULL, PRIMARY KEY(object_type, object_id))")
            guard let objects = page["objects"] as? [[String: Any]] else {
                throw invalid("sync_identity_pack_page_invalid")
            }
            for object in objects {
                try database.execute("INSERT INTO selected_identity_objects VALUES (?, ?)",
                    values: [object["object_type"], object["object_id"]])
            }
            let facts = page["facts"] as? [String: Any]
            let factTail = try facts.flatMap { facts in
                facts["section"] as? String == "head" ? nil :
                    try copyFacts(database, definitions, facts)
            }
            let thinPrelude = try facts != nil || database.scalar(definitions.identityThinPreludeSql) == 1
            if factTail == nil {
                for (index, sql) in definitions.copyStatements.enumerated() {
                    if index == definitions.stateCopyIndex {
                        try database.execute(definitions.identityStateCopySql)
                    } else if index == definitions.stateCopyIndex + 1 {
                        try database.execute(definitions.identityPreludeCopySql)
                        try database.execute(definitions.identityHeadCopySql)
                    } else if thinPrelude && index == definitions.stateCopyIndex + 4 {
                        try database.execute(definitions.identityFactHeadCopySql)
                    } else if index == definitions.reviewCopyIndex {
                        if thinPrelude { continue }
                        try database.execute(definitions.identityReviewCopySql)
                    } else {
                        if index == definitions.payloadCopyIndex {
                            try FolioleCompanionSyncPackPayloadWriter.copy(database, plans: definitions.payloadPlans)
                        }
                        try database.execute(sql)
                    }
                }
            }
            if let missing = try database.namedRows(definitions.identityMissingOriginalHeadSql).first?["version_id"] as? String {
                throw invalid("sync_pack_fact_body_unavailable:\(missing)")
            }
            let dependencies = try dependencies(database, selectedCount: objects.count)
            let tables = try definitions.tableNames.map { name in
                ["name": name, "row_count": try database.scalar("SELECT COUNT(*) FROM \"\(name)\"")] as [String: Any]
            }
            var inner: [String: Any] = ["contract": "global-id-v1", "pack_id": packId,
                "identity_page": page, "dependencies": dependencies, "tables": tables]
            if let factTail { inner["fact_tail"] = factTail }
            if let chunk = try FolioleCompanionIdentityFactChunkWriter.metadata(database) { inner["fact_chunk"] = chunk }
            let manifest = try JSONSerialization.data(withJSONObject: inner, options: [.sortedKeys])
            try database.execute("INSERT INTO pack_manifest (key, value) VALUES ('manifest_json', ?)",
                values: [String(decoding: manifest, as: UTF8.self)])
            try database.execute("COMMIT")
            try database.execute("DETACH DATABASE source")
            return inner
        } catch {
            try? database.execute("ROLLBACK")
            try? database.execute("DETACH DATABASE source")
            throw error
        }
    }

    private static func copyFacts(
        _ database: FolioleCompanionSyncPackSQLite,
        _ definitions: FolioleCompanionSyncPackProviderDefinitions, _ facts: [String: Any]
    ) throws -> [String: Any] {
        try database.execute("CREATE TEMP TABLE selected_identity_fact " +
            "(after_key TEXT, page_limit INTEGER, fact_digest TEXT, chunk_offset INTEGER DEFAULT 0)")
        try database.execute("INSERT INTO selected_identity_fact (after_key, page_limit, fact_digest) VALUES (?, ?, ?)",
            values: [facts["after"], facts["limit"], facts["digest"]])
        guard try database.scalar(definitions.identityFactValidateSql) == 1 else {
            throw invalid("sync_identity_fact_source_mismatch")
        }
        try database.execute(definitions.identityStateCopySql)
        try database.execute(definitions.identityHeadCopySql)
        guard let plan = definitions.identityFactPlans.first(where: {
            $0["section"] as? String == facts["section"] as? String
        }), let preflight = plan["preflightSql"] as? String,
            let copy = plan["copySql"] as? String, let tail = plan["tailSql"] as? String else {
            throw invalid("sync_identity_fact_request_invalid")
        }
        if let tail = try FolioleCompanionIdentityFactChunkWriter.copy(database, facts: facts, plan: plan) { return tail }
        guard try database.scalar(preflight) <= 2 * 1024 * 1024 else {
            throw invalid("sync_identity_fact_row_over_budget")
        }
        try database.execute(copy)
        let rows = try database.namedRows(tail)
        guard let row = rows.first else { throw invalid("sync_identity_fact_request_invalid") }
        return ["nextAfter": row["next_after"] ?? NSNull()]
    }

    private static func dependencies(
        _ database: FolioleCompanionSyncPackSQLite, selectedCount: Int
    ) throws -> [[String: Any]] {
        let rows = try database.namedRows(
            "SELECT state.object_type, state.object_id, indexed.fingerprint " +
            "FROM sync_object_state state LEFT JOIN selected_identity_objects selected " +
            "ON selected.object_type = state.object_type AND selected.object_id = state.object_id " +
            "LEFT JOIN source.sync_identity_index_rows indexed " +
            "ON indexed.object_type = state.object_type AND indexed.object_id = state.object_id " +
            "WHERE selected.object_id IS NULL ORDER BY state.object_id"
        )
        guard rows.count <= 128, try database.scalar("SELECT COUNT(*) FROM sync_object_state") ==
            selectedCount + rows.count else { throw invalid("sync_identity_pack_page_over_budget") }
        return try rows.map { row in
            guard row["object_type"] as? String == "node",
                  let objectId = row["object_id"] as? String,
                  let fingerprint = row["fingerprint"] as? String else {
                throw invalid("sync_identity_pack_state_scope_mismatch")
            }
            return ["object_type": "node", "object_id": objectId, "fingerprint": fingerprint]
        }
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncIdentityPackBuilder", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}
