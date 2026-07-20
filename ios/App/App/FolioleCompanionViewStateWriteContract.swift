import Foundation

struct FolioleCompanionViewStateWriteContract {
    let activeNodeKey: String
    let activeNodePayloadKey: String
    let activeNodeSQL: String
    let canonicalKeys: [String: String]
    let formFactor: String
    let hashIgnoredPayloadKeys: Set<String>
    let localSource: String
    let nodeIdPayloadKey: String
    let nodeKeyPrefix: String
    let nodeStateSQL: String
    let objectIdDelimiter: String
    let platform: String
    let resultKeys: [String: String]
    let scope: String
    let scrollTopPayloadKey: String
    let selectionFromPayloadKey: String
    let selectionToPayloadKey: String
    let sourcePayloadKey: String
    let workspaceMetaKey: String

    init(bundle: Bundle = .main) throws {
        let query = try FolioleCompanionJsonContract.load("companion-query-definitions", bundle: bundle)
        let mutation = try FolioleCompanionJsonContract.load("companion-mutation-definitions", bundle: bundle)
        let sync = try FolioleCompanionJsonContract.load("companion-sync-protocol-definitions", bundle: bundle)
        let active = try FolioleCompanionJsonContract.object(
            ["queries", "syncPayloadViewActiveNode", "syncPayload"], in: query
        )
        let node = try FolioleCompanionJsonContract.object(
            ["queries", "syncPayloadViewNodeState", "syncPayload"], in: query
        )
        let viewMutations = try FolioleCompanionJsonContract.object(
            ["syncApplyMutations", "viewState"], in: mutation
        )
        let statements = try FolioleCompanionJsonContract.object(["statements"], in: mutation)
        activeNodeKey = try Self.string("objectIdKey", in: active)
        activeNodePayloadKey = try Self.string("activeNodePayloadKey", in: active)
        activeNodeSQL = try Self.mutationSQL("activeNodeUpsertMutationName", viewMutations, statements)
        canonicalKeys = try Self.stringMap(["syncWrite", "viewCanonicalKeys"], in: sync)
        formFactor = try Self.string("formFactor", in: active)
        hashIgnoredPayloadKeys = Set(try Self.strings("hashIgnoredPayloadKeys", in: node))
        localSource = try Self.string("localSource", in: node)
        nodeIdPayloadKey = try Self.string("nodeIdPayloadKey", in: node)
        nodeKeyPrefix = try Self.string("objectIdPrefix", in: node)
        nodeStateSQL = try Self.mutationSQL("nodeStateUpsertMutationName", viewMutations, statements)
        objectIdDelimiter = try FolioleCompanionJsonContract.string(
            ["syncPayloadRouting", "objectIdDelimiter"], in: query
        )
        platform = try Self.string("platform", in: active)
        resultKeys = try Self.stringMap(["syncWrite", "resultKeys"], in: sync)
        scope = try Self.string("scope", in: active)
        scrollTopPayloadKey = try Self.string("scrollTopPayloadKey", in: node)
        selectionFromPayloadKey = try Self.string("selectionFromPayloadKey", in: node)
        selectionToPayloadKey = try Self.string("selectionToPayloadKey", in: node)
        sourcePayloadKey = try Self.string("sourcePayloadKey", in: node)
        workspaceMetaKey = try Self.string("workspaceMetaKey", in: active)
    }

    private static func mutationSQL(
        _ key: String,
        _ mutations: [String: Any],
        _ statements: [String: Any]
    ) throws -> String {
        let name = try string(key, in: mutations)
        return try string(name, in: statements)
    }

    private static func string(_ key: String, in object: [String: Any]) throws -> String {
        guard let value = object[key] as? String, !value.isEmpty else {
            throw FolioleCompanionJsonContract.error(key)
        }
        return value
    }

    private static func strings(_ key: String, in object: [String: Any]) throws -> [String] {
        guard let value = object[key] as? [String] else { throw FolioleCompanionJsonContract.error(key) }
        return value
    }

    private static func stringMap(_ path: [String], in root: [String: Any]) throws -> [String: String] {
        let object = try FolioleCompanionJsonContract.object(path, in: root)
        return try object.reduce(into: [:]) { result, entry in
            guard let value = entry.value as? String, !value.isEmpty else {
                throw FolioleCompanionJsonContract.error(path.joined(separator: "."))
            }
            result[entry.key] = value
        }
    }
}

enum FolioleCompanionJsonContract {
    static func load(_ name: String, bundle: Bundle) throws -> [String: Any] {
        guard let url = bundle.url(forResource: name, withExtension: "json") else { throw error(name) }
        let value = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        guard let object = value as? [String: Any] else { throw error(name) }
        return object
    }

    static func object(_ path: [String], in root: [String: Any]) throws -> [String: Any] {
        guard let result = try value(path, in: root) as? [String: Any] else {
            throw error(path.joined(separator: "."))
        }
        return result
    }

    static func string(_ path: [String], in root: [String: Any]) throws -> String {
        guard let result = try value(path, in: root) as? String, !result.isEmpty else {
            throw error(path.joined(separator: "."))
        }
        return result
    }

    static func error(_ detail: String) -> NSError {
        NSError(
            domain: "FolioleCompanionViewStateWriteContract",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Invalid view-state write contract: \(detail)"]
        )
    }

    private static func value(_ path: [String], in root: [String: Any]) throws -> Any {
        var current: Any = root
        for key in path {
            guard let object = current as? [String: Any], let next = object[key] else {
                throw error(path.joined(separator: "."))
            }
            current = next
        }
        return current
    }
}
