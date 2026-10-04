import Foundation
import CryptoKit

/** Mechanical canonical JSON binding for the shared identity page contract. */
enum FolioleCompanionIdentityPageContract {
    static func validate(_ page: [String: Any], manifest: [String: Any]) throws {
        guard page["contract"] as? String == "global-id-v1" else { throw invalid() }
        var material = try ["group_id", "source_peer_id", "target_peer_id", "source_view_id"].map {
            try quote(string(page, $0))
        }
        let index = try integer(page, "page_index")
        guard index >= 0, index <= 9007199254740991, let previous = page["previous_page_id"],
              let objects = page["objects"] as? [[String: Any]] else { throw invalid() }
        guard (index == 0) == (previous is NSNull),
              page.count == 9 + (page["restore_id"] == nil ? 0 : 2) + (page["facts"] == nil ? 0 : 1),
              objects.count <= 128 else { throw invalid() }
        if let previous = previous as? String {
            guard previous.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw invalid() }
        }
        material.append(String(index))
        material.append(try nullable(previous))
        let keys = try objects.map { object in
            guard object.count == 3 else { throw invalid() }
            return "[" + (try ["object_type", "object_id", "fingerprint"].map {
                try quote(string(object, $0))
            }).joined(separator: ",") + "]"
        }
        material.append("[" + keys.joined(separator: ",") + "]")
        if page["restore_id"] != nil {
            material.append(try quote(string(page, "restore_id")))
            material.append(try quote(string(page, "restore_set_id")))
        } else if page["restore_set_id"] != nil { throw invalid() }
        if let facts = page["facts"] as? [String: Any] {
            guard objects.count == 1, objects[0]["object_type"] as? String == "node" else { throw invalid() }
            material.append(try factMaterial(facts))
        } else if page["facts"] != nil { throw invalid() }
        let data = Data(("[" + material.joined(separator: ",") + "]").utf8)
        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        guard try string(page, "page_id") == digest else { throw invalid() }
        try validateTail(page, manifest)
    }

    static func comparable(_ page: [String: Any], manifest: [String: Any]) throws -> String {
        try validate(page, manifest: manifest)
        var value: [String: Any] = ["page": page]
        if let tail = manifest["fact_tail"] { value["fact_tail"] = tail }
        if let chunk = manifest["fact_chunk"] { value["fact_chunk"] = chunk }
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes])
        return String(decoding: data, as: UTF8.self)
    }

    private static func factMaterial(_ facts: [String: Any]) throws -> String {
        let section = try string(facts, "section")
        let limit = try integer(facts, "limit")
        let digest = try string(facts, "digest")
        guard facts.count == 4 + (facts["chunk"] == nil ? 0 : 1), ["versions", "parents", "reviews", "head"].contains(section),
              (1...64).contains(limit), digest.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              let after = facts["after"] else { throw invalid() }
        try requireCursor(after)
        guard section != "head" || (after is NSNull && facts["chunk"] == nil) else { throw invalid() }
        var json = "{\"section\":" + quote(section) + ",\"after\":" + (try nullable(after)) +
            ",\"limit\":" + String(limit) + ",\"digest\":" + quote(digest)
        if let chunk = facts["chunk"] as? [String: Any] { json += ",\"chunk\":" + (try chunkMaterial(chunk, offsetKey: "offset", minimum: 0)) }
        else if facts["chunk"] != nil { throw invalid() }
        return json + "}"
    }

    private static func validateTail(_ page: [String: Any], _ manifest: [String: Any]) throws {
        let facts = page["facts"] as? [String: Any]
        let phase = facts != nil && facts?["section"] as? String != "head"
        guard phase == (manifest["fact_tail"] != nil) else { throw invalid() }
        if phase {
            guard let tail = manifest["fact_tail"] as? [String: Any], tail.count == 1 + (tail["chunk"] == nil ? 0 : 1),
                  let cursor = tail["nextAfter"] else { throw invalid() }
            try requireCursor(cursor)
            if let chunk = tail["chunk"] as? [String: Any] { _ = try chunkMaterial(chunk, offsetKey: "nextOffset", minimum: 1) }
            else if tail["chunk"] != nil { throw invalid() }
        }
        if let metadata = manifest["fact_chunk"] as? [String: Any] {
            guard phase else { throw invalid() }
            _ = try chunkMaterial(metadata, offsetKey: "offset", minimum: 0)
            if let requested = facts?["chunk"] as? [String: Any] {
                guard NSDictionary(dictionary: requested).isEqual(to: metadata) else { throw invalid() }
            } else { guard try integer(metadata, "offset") == 0 else { throw invalid() } }
        } else if manifest["fact_chunk"] != nil || facts?["chunk"] != nil ||
            (manifest["fact_tail"] as? [String: Any])?["chunk"] != nil { throw invalid() }
    }

    private static func chunkMaterial(_ chunk: [String: Any], offsetKey: String, minimum: Int) throws -> String {
        let key = try string(chunk, "key")
        let offset = try integer(chunk, offsetKey), total = try integer(chunk, "total")
        guard chunk.count == 3, !key.isEmpty, key.utf16.count <= 4096,
              offset >= minimum, offset < total, total <= 9007199254740991 else { throw invalid() }
        return "{\"key\":" + quote(key) + ",\"" + offsetKey + "\":" + String(offset) +
            ",\"total\":" + String(total) + "}"
    }

    private static func requireCursor(_ value: Any) throws {
        if value is NSNull { return }
        guard let text = value as? String, !text.isEmpty, text.utf16.count <= 4096 else { throw invalid() }
    }

    private static func nullable(_ value: Any) throws -> String {
        if value is NSNull { return "null" }
        guard let text = value as? String else { throw invalid() }
        return quote(text)
    }

    private static func quote(_ text: String) -> String {
        var json = "\""
        for scalar in text.unicodeScalars {
            switch scalar.value {
            case 34: json += "\\\""
            case 92: json += "\\\\"
            case 8: json += "\\b"
            case 12: json += "\\f"
            case 10: json += "\\n"
            case 13: json += "\\r"
            case 9: json += "\\t"
            case 0..<32: json += String(format: "\\u%04x", scalar.value)
            default: json.unicodeScalars.append(scalar)
            }
        }
        return json + "\""
    }

    private static func string(_ value: [String: Any], _ key: String) throws -> String {
        guard let text = value[key] as? String else { throw invalid() }
        return text
    }

    private static func integer(_ value: [String: Any], _ key: String) throws -> Int {
        guard let number = value[key] as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue == Double(number.intValue) else {
            throw invalid()
        }
        return number.intValue
    }

    private static func invalid() -> NSError {
        NSError(domain: "FolioleSyncPack", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "sync_identity_pack_page_invalid"])
    }
}
