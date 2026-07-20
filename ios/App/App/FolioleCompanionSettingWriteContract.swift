import Foundation

struct FolioleCompanionSettingWriteContract {
    let canonicalKeys: [String: String]
    let defaults: [String: String]
    let existingStateSQL: String
    let metaValueSQL: String
    let nextStateSeqSQL: String
    let objectIdDelimiter: String
    let objectType: String
    let payloadKeys: [String: String]
    let pushAckDeleteSQL: String
    let pushAckTable: String
    let resultKeys: [String: String]
    let settingUpsertSQL: String
    let stateUpsertSQL: String

    init(bundle: Bundle = .main) throws {
        let query = try FolioleCompanionJsonContract.load("companion-query-definitions", bundle: bundle)
        let mutation = try FolioleCompanionJsonContract.load("companion-mutation-definitions", bundle: bundle)
        let sync = try FolioleCompanionJsonContract.load("companion-sync-protocol-definitions", bundle: bundle)
        let setting = try FolioleCompanionJsonContract.object(
            ["queries", "syncPayloadSetting", "syncPayload"], in: query
        )
        let runtimeQueries = try FolioleCompanionJsonContract.object(["runtimeQueries"], in: query)
        let statements = try FolioleCompanionJsonContract.object(["statements"], in: mutation)
        let runtimeMutations = try FolioleCompanionJsonContract.object(["runtimeMutations"], in: mutation)
        let settingMutations = try FolioleCompanionJsonContract.object(
            ["syncApplyMutations", "settings"], in: mutation
        )
        canonicalKeys = try Self.stringMap(["syncWrite", "viewCanonicalKeys"], in: sync)
        defaults = try Self.mapped(setting, [
            "deviceId": "defaultDeviceId", "formFactor": "defaultFormFactor",
            "platform": "defaultPlatform", "scope": "defaultScope", "valueJson": "defaultValueJson"
        ])
        payloadKeys = try Self.mapped(setting, [
            "deviceId": "deviceIdPayloadKey", "formFactor": "formFactorPayloadKey",
            "key": "keyPayloadKey", "platform": "platformPayloadKey",
            "scope": "scopePayloadKey", "valueJson": "valueJsonPayloadKey"
        ])
        objectType = try Self.string("objectType", in: setting)
        objectIdDelimiter = try FolioleCompanionJsonContract.string(
            ["syncPayloadRouting", "objectIdDelimiter"], in: query
        )
        resultKeys = try Self.stringMap(["syncWrite", "resultKeys"], in: sync)
        settingUpsertSQL = try Self.statement(
            "upsertMutationName", group: settingMutations, statements: statements
        )
        let state = try Self.group("syncState", in: runtimeMutations)
        stateUpsertSQL = try Self.statement("upsertMutationName", group: state, statements: statements)
        let ack = try Self.group("syncPushAck", in: runtimeMutations)
        pushAckDeleteSQL = try Self.statement("deleteByObjectMutationName", group: ack, statements: statements)
        pushAckTable = try Self.string("tableName", in: ack)
        existingStateSQL = try Self.querySQL("existingState", runtime: runtimeQueries, root: query)
        nextStateSeqSQL = try Self.querySQL("nextStateSeq", runtime: runtimeQueries, root: query)
        metaValueSQL = try Self.querySQL("companionMeta", runtime: runtimeQueries, root: query)
    }

    func key(_ name: String, in values: [String: String]) throws -> String {
        guard let value = values[name] else { throw Self.error("missing \(name)") }
        return value
    }

    private static func querySQL(
        _ name: String, runtime: [String: Any], root: [String: Any]
    ) throws -> String {
        let group = try group(name, in: runtime)
        let queryName = try string("queryName", in: group)
        return try FolioleCompanionJsonContract.string(["queries", queryName, "sql"], in: root)
    }

    private static func statement(
        _ name: String, group: [String: Any], statements: [String: Any]
    ) throws -> String {
        try string(try string(name, in: group), in: statements)
    }

    private static func group(_ name: String, in root: [String: Any]) throws -> [String: Any] {
        try FolioleCompanionJsonContract.object([name], in: root)
    }

    private static func mapped(
        _ root: [String: Any], _ names: [String: String]
    ) throws -> [String: String] {
        try names.reduce(into: [:]) { result, entry in
            result[entry.key] = try string(entry.value, in: root)
        }
    }

    private static func stringMap(_ path: [String], in root: [String: Any]) throws -> [String: String] {
        let object = try FolioleCompanionJsonContract.object(path, in: root)
        return try object.reduce(into: [:]) { result, entry in
            guard let value = entry.value as? String, !value.isEmpty else { throw error(entry.key) }
            result[entry.key] = value
        }
    }

    private static func string(_ name: String, in root: [String: Any]) throws -> String {
        guard let value = root[name] as? String, !value.isEmpty else { throw error(name) }
        return value
    }

    private static func error(_ detail: String) -> NSError {
        NSError(
            domain: "FolioleCompanionSettingWriteContract", code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Invalid setting write contract: \(detail)"]
        )
    }
}
