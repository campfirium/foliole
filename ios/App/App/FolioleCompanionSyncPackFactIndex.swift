import CryptoKit
import Foundation

enum FolioleCompanionSyncPackFactIndex {
    static func read(_ database: FolioleCompanionSyncPackSQLite, from: Int, to: Int,
                     frontier: Int, epoch: String) throws -> [String: Any] {
        let sourceVersions = try database.namedRows(
            "SELECT version_id, object_id, parent_version_id, host_name, created_at, " +
            "content_hash, body_text, snapshot_json, " +
            "json_remove(snapshot_json, '$.content') AS snapshot_metadata " +
            "FROM node_sync_versions ORDER BY object_id, created_at, version_id"
        )
        let versions = try sourceVersions.map { row -> [String: Any] in
            guard let snapshotText = row["snapshot_json"] as? String,
                  let snapshot = try JSONSerialization.jsonObject(with: Data(snapshotText.utf8)) as? [String: Any]
            else { throw invalid("sync_pack_fact_index_invalid") }
            let body = row["body_text"] as? String ?? (snapshot["content"] as? String ??
                (snapshot["content"] == nil ? "" : nil))
            return [
                "version_id": row["version_id"] ?? NSNull(), "object_id": row["object_id"] ?? NSNull(),
                "parent_version_id": row["parent_version_id"] ?? NSNull(),
                "host_name": row["host_name"] ?? NSNull(), "created_at": row["created_at"] ?? NSNull(),
                "content_hash": row["content_hash"] ?? NSNull(),
                "body_hash": body.map { sha(Data($0.utf8)) as Any } ?? NSNull(),
                "snapshot_metadata": row["snapshot_metadata"] ?? NSNull()
            ]
        }
        let parents = try database.namedRows(
            "SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents " +
            "ORDER BY version_id, ordinal"
        )
        let reviews = try database.namedRows(
            "SELECT id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, " +
            "due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after " +
            "FROM review_log ORDER BY reviewed_at, op_id"
        )
        guard versions.count <= 128, parents.count <= 128, reviews.count <= 128 else {
            throw invalid("sync_pack_fact_index_over_budget")
        }
        var index: [String: Any] = [
            "from_state_seq": from, "to_state_seq": to, "frontier_state_seq": frontier,
            "source_epoch": epoch, "versions": versions, "parents": parents, "reviews": reviews
        ]
        let identity = try JSONSerialization.data(withJSONObject: index, options: [.sortedKeys])
        guard identity.count <= 256 * 1024 else { throw invalid("sync_pack_fact_index_over_budget") }
        index["index_id"] = sha(identity)
        return index
    }

    static func retainMissing(_ database: FolioleCompanionSyncPackSQLite, index: [String: Any],
                              expectedId: String, versions versionBits: String,
                              parents parentBits: String, reviews reviewBits: String) throws {
        guard index["index_id"] as? String == expectedId,
              let versions = index["versions"] as? [[String: Any]],
              let parents = index["parents"] as? [[String: Any]],
              let reviews = index["reviews"] as? [[String: Any]] else {
            throw invalid("sync_pack_fact_index_changed")
        }
        let heldVersions = try bits(versionBits, count: versions.count)
        let heldParents = try bits(parentBits, count: parents.count)
        let heldReviews = try bits(reviewBits, count: reviews.count)
        let heads = Set(try database.namedRows("SELECT current_version_id FROM nodes UNION SELECT version_id AS current_version_id FROM node_sync_tombstones")
            .compactMap { $0["current_version_id"] as? String })
        for (offset, held) in heldVersions.enumerated() where !held {
            if let versionId = versions[offset]["version_id"] as? String,
               heads.contains(versionId), versions[offset]["body_hash"] is NSNull {
                throw invalid("sync_pack_fact_body_unavailable")
            }
        }
        try database.execute("BEGIN")
        do {
            for (offset, held) in heldVersions.enumerated() where held {
                try database.execute("DELETE FROM node_sync_versions WHERE version_id = ?",
                    values: [versions[offset]["version_id"]])
            }
            for (offset, held) in heldParents.enumerated() where held {
                let edge = parents[offset]
                try database.execute("DELETE FROM node_sync_version_parents WHERE version_id = ? " +
                    "AND parent_version_id = ? AND ordinal = ?",
                    values: [edge["version_id"], edge["parent_version_id"], edge["ordinal"]])
            }
            for (offset, held) in heldReviews.enumerated() where held {
                try database.execute("DELETE FROM review_log WHERE op_id = ?",
                    values: [reviews[offset]["op_id"]])
            }
            try database.execute("COMMIT")
        } catch { try? database.execute("ROLLBACK"); throw error }
        try database.execute("VACUUM")
    }

    private static func bits(_ hex: String, count: Int) throws -> [Bool] {
        guard hex.count == ((count + 7) / 8) * 2,
              hex.allSatisfy({ $0.isHexDigit && !$0.isUppercase }) else {
            throw invalid("sync_pack_fact_claims_invalid")
        }
        let characters = Array(hex)
        let bytes = try stride(from: 0, to: characters.count, by: 2).map { offset -> UInt8 in
            guard let value = UInt8(String(characters[offset...offset + 1]), radix: 16) else {
                throw invalid("sync_pack_fact_claims_invalid")
            }
            return value
        }
        if count % 8 != 0, let last = bytes.last, last >> (count % 8) != 0 {
            throw invalid("sync_pack_fact_claims_invalid")
        }
        return (0..<count).map { bytes[$0 / 8] & (1 << ($0 % 8)) != 0 }
    }

    private static func sha(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: message, code: 1)
    }
}
