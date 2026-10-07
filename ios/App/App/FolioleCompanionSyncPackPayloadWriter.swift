import Foundation

enum FolioleCompanionSyncPackPayloadWriter {
    static func copy(_ database: FolioleCompanionSyncPackSQLite, plans: [[String: Any]]) throws {
        var payloads: [String: String] = [:]
        for plan in plans {
            guard let objectType = plan["objectType"] as? String, let sql = plan["sql"] as? String else { continue }
            for row in try database.namedRows(sql) {
                guard let objectId = row["__object_id"] as? String else { continue }
                var payload: [String: Any] = [:]
                for (name, value) in row where name != "__object_id" { assign(&payload, name, value) }
                let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
                payloads[key(objectType, objectId)] = String(decoding: data, as: UTF8.self)
            }
        }
        let states = try database.rows(
            "SELECT object_type, object_id, content_hash, updated_at, deleted_at FROM sync_object_state " +
            "WHERE object_type NOT IN ('external_document','node')"
        )
        for state in states {
            guard state.count == 5, let type = state[0] as? String, let objectId = state[1] as? String else { continue }
            let deleted = state[4] as? String
            let payload = deleted == nil ? payloads[key(type, objectId)] : nil
            if deleted == nil && payload == nil { continue }
            try database.insertSyncObject([type, objectId, state[2], payload, state[3], deleted])
        }
    }

    static func copyTopicTextBodies(_ database: FolioleCompanionSyncPackSQLite) throws {
        var after = ""
        while let row = try database.namedRows("SELECT version_id, snapshot_json FROM node_sync_versions " +
            "WHERE body_text IS NOT NULL AND version_id > '\(after.replacingOccurrences(of: "'", with: "''"))' " +
            "ORDER BY version_id LIMIT 1").first {
            guard let id = row["version_id"] as? String, let json = row["snapshot_json"] as? String,
                  var snapshot = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] else {
                throw NSError(domain: "text_alternative_snapshot_invalid", code: 1)
            }
            after = id
            guard let entries = snapshot["text_alternatives"] as? [[String: Any]], !entries.isEmpty else { continue }
            snapshot["text_alternative_bodies"] = try entries.map { entry in
                guard let hash = entry["body_blob_hash"] as? String,
                      let data = try database.namedRows("SELECT data FROM source.content_blob_data WHERE hash = " +
                        "'\(hash.replacingOccurrences(of: "'", with: "''"))'").first?["data"] as? Data,
                      let text = String(data: data, encoding: .utf8) else {
                    throw NSError(domain: "text_alternative_body_unavailable", code: 1)
                }
                return ["hash": hash, "text": text]
            }
            let bytes = try JSONSerialization.data(withJSONObject: snapshot, options: [.sortedKeys])
            try database.execute("UPDATE node_sync_versions SET snapshot_json = ? WHERE version_id = ?",
                values: [String(decoding: bytes, as: UTF8.self), id])
        }
    }

    private static func assign(_ result: inout [String: Any], _ name: String, _ value: Any) {
        guard let separator = name.range(of: "__") else { result[name] = value; return }
        let parent = String(name[..<separator.lowerBound]), child = String(name[separator.upperBound...])
        var nested = result[parent] as? [String: Any] ?? [:]
        nested[child] = value
        result[parent] = nested
    }

    private static func key(_ type: String, _ id: String) -> String { type + "\u{0}" + id }
}
