import Foundation

/** Writes fixed-size original fact JSON bytes into the existing pack metadata table. */
enum FolioleCompanionIdentityFactChunkWriter {
    static func copy(_ database: FolioleCompanionSyncPackSQLite,
        facts: [String: Any], plan: [String: Any]) throws -> [String: Any]? {
        guard let sql = plan["metadataSql"] as? String, let chunkSql = plan["chunkSql"] as? String else {
            throw invalid()
        }
        guard let row = try database.namedRows(sql).first,
              let key = row["fact_key"] as? String, let total = row["total"] as? Int else {
            if facts["chunk"] != nil { throw invalid() }
            return nil
        }
        if facts["chunk"] == nil && total <= 262144 { return nil }
        let request = facts["chunk"] as? [String: Any]
        let offset = request?["offset"] as? Int ?? 0
        guard offset >= 0, offset < total, request == nil ||
            (request?["key"] as? String == key && request?["total"] as? Int == total) else { throw invalid() }
        try database.execute("UPDATE selected_identity_fact SET chunk_offset = ?", values: [offset])
        guard let bytes = try database.namedRows(chunkSql).first?["data"] as? Data,
              bytes.count == min(262144, total - offset) else { throw invalid() }
        let payload: [String: Any] = ["key": key, "offset": offset, "total": total,
            "data_base64": bytes.base64EncodedString()]
        let json = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        try database.execute("INSERT INTO pack_manifest (key, value) VALUES ('fact_chunk', ?)",
            values: [String(decoding: json, as: UTF8.self)])
        let nextOffset = offset + bytes.count
        var tail: [String: Any] = ["nextAfter": nextOffset < total ? facts["after"] ?? NSNull() :
            row["has_more"] as? Int == 1 ? key as Any : NSNull()]
        if nextOffset < total { tail["chunk"] = ["key": key, "nextOffset": nextOffset, "total": total] }
        return tail
    }

    static func metadata(_ database: FolioleCompanionSyncPackSQLite) throws -> [String: Any]? {
        try database.namedRows("SELECT json_extract(value, '$.key') AS key, " +
            "json_extract(value, '$.offset') AS offset, json_extract(value, '$.total') AS total " +
            "FROM pack_manifest WHERE key = 'fact_chunk'").first
    }

    private static func invalid() -> NSError {
        NSError(domain: "FolioleCompanionIdentityFactChunkWriter", code: 1,
            userInfo: [NSLocalizedDescriptionKey: "sync_identity_fact_chunk_source_mismatch"])
    }
}
