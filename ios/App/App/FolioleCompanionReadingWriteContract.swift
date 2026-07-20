import Foundation

struct FolioleCompanionReadingWriteContract {
    let defaults: [String: Any]
    let existingStateSQL: String
    let hashIgnoredPayloadKeys: Set<String>
    let metaValueSQL: String
    let nextStateSeqSQL: String
    let objectType: String
    let payloadKeys: [String: String]
    let pushAckDeleteSQL: String
    let pushAckTable: String
    let readingDeviceStateUpsertSQL: String
    let readingUpsertSQL: String
    let resultKeys: [String: String]
    let stateUpsertSQL: String

    init(bundle: Bundle = .main) throws {
        let query = try FolioleCompanionJsonContract.load("companion-query-definitions", bundle: bundle)
        let mutation = try FolioleCompanionJsonContract.load("companion-mutation-definitions", bundle: bundle)
        let sync = try FolioleCompanionJsonContract.load("companion-sync-protocol-definitions", bundle: bundle)
        let reading = try FolioleCompanionJsonContract.object(
            ["queries", "syncPayloadNodeReading", "syncPayload"], in: query
        )
        let statements = try FolioleCompanionJsonContract.object(["statements"], in: mutation)
        let learning = try FolioleCompanionJsonContract.object(["syncApplyMutations", "learning"], in: mutation)
        let runtime = try FolioleCompanionJsonContract.object(["runtimeMutations"], in: mutation)
        let runtimeQueries = try FolioleCompanionJsonContract.object(["runtimeQueries"], in: query)
        defaults = Self.values(reading, [
            "deviceId": "defaultDeviceId", "intervalDurationMs": "defaultIntervalDurationMs",
            "intervalGrowthFactor": "defaultIntervalGrowthFactor", "priority": "defaultPriority",
            "readingPosition": "defaultReadingPosition", "repetitionCount": "defaultRepetitionCount",
            "state": "defaultState"
        ])
        payloadKeys = try Self.strings(reading, [
            "deviceId": "deviceIdPayloadKey", "input": "inputPayloadKey",
            "intervalDurationMs": "intervalDurationMsPayloadKey",
            "intervalGrowthFactor": "intervalGrowthFactorPayloadKey",
            "lastHandledAt": "lastHandledAtPayloadKey", "nextAt": "nextAtPayloadKey",
            "nodeId": "nodeIdPayloadKey", "priority": "priorityPayloadKey",
            "readingPosition": "readingPositionPayloadKey", "repetitionCount": "repetitionCountPayloadKey",
            "state": "statePayloadKey"
        ])
        hashIgnoredPayloadKeys = Set(try Self.stringArray("hashIgnoredPayloadKeys", reading))
        objectType = try FolioleCompanionJsonContract.string(["syncObjectTypes", "nodeReading"], in: sync)
        resultKeys = try Self.stringMap(["syncWrite", "resultKeys"], sync)
        readingUpsertSQL = try Self.statement("readingUpsertMutationName", learning, statements)
        readingDeviceStateUpsertSQL = try Self.statement("readingDeviceStateUpsertMutationName", learning, statements)
        let state = try Self.group("syncState", runtime)
        stateUpsertSQL = try Self.statement("upsertMutationName", state, statements)
        let ack = try Self.group("syncPushAck", runtime)
        pushAckDeleteSQL = try Self.statement("deleteByObjectMutationName", ack, statements)
        pushAckTable = try Self.string("tableName", ack)
        existingStateSQL = try Self.querySQL("existingState", runtimeQueries, query)
        nextStateSeqSQL = try Self.querySQL("nextStateSeq", runtimeQueries, query)
        metaValueSQL = try Self.querySQL("companionMeta", runtimeQueries, query)
    }

    func key(_ name: String, in values: [String: String]) throws -> String {
        guard let value = values[name] else { throw FolioleCompanionJsonContract.error(name) }
        return value
    }

    private static func querySQL(_ name: String, _ runtime: [String: Any], _ root: [String: Any]) throws -> String {
        let queryName = try string("queryName", group(name, runtime))
        return try FolioleCompanionJsonContract.string(["queries", queryName, "sql"], in: root)
    }

    private static func statement(_ key: String, _ group: [String: Any], _ statements: [String: Any]) throws -> String {
        try string(try string(key, group), statements)
    }

    private static func group(_ key: String, _ root: [String: Any]) throws -> [String: Any] {
        try FolioleCompanionJsonContract.object([key], in: root)
    }

    private static func string(_ key: String, _ root: [String: Any]) throws -> String {
        guard let value = root[key] as? String, !value.isEmpty else { throw FolioleCompanionJsonContract.error(key) }
        return value
    }

    private static func strings(_ root: [String: Any], _ names: [String: String]) throws -> [String: String] {
        try names.reduce(into: [:]) { $0[$1.key] = try string($1.value, root) }
    }

    private static func values(_ root: [String: Any], _ names: [String: String]) -> [String: Any] {
        names.reduce(into: [:]) { if let value = root[$1.value] { $0[$1.key] = value } }
    }

    private static func stringArray(_ key: String, _ root: [String: Any]) throws -> [String] {
        guard let value = root[key] as? [String] else { throw FolioleCompanionJsonContract.error(key) }
        return value
    }

    private static func stringMap(_ path: [String], _ root: [String: Any]) throws -> [String: String] {
        let object = try FolioleCompanionJsonContract.object(path, in: root)
        return try object.reduce(into: [:]) { result, entry in
            guard let value = entry.value as? String else { throw FolioleCompanionJsonContract.error(entry.key) }
            result[entry.key] = value
        }
    }
}
