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

    private static func assign(_ result: inout [String: Any], _ name: String, _ value: Any) {
        guard let separator = name.range(of: "__") else { result[name] = value; return }
        let parent = String(name[..<separator.lowerBound]), child = String(name[separator.upperBound...])
        var nested = result[parent] as? [String: Any] ?? [:]
        nested[child] = value
        result[parent] = nested
    }

    private static func key(_ type: String, _ id: String) -> String { type + "\u{0}" + id }
}
