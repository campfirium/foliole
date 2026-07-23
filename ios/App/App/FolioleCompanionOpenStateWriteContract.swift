import Foundation

struct FolioleCompanionOpenStateWriteContract {
    let existingStateSQL: String
    let metaValueSQL: String
    let nextStateSeqSQL: String
    let objectType: String
    let payloadQuerySQL: String
    let pushAckDeleteSQL: String
    let pushAckTable: String
    let stateUpsertSQL: String
    let upsertSQL: String

    init(bundle: Bundle = .main) throws {
        let query = try FolioleCompanionJsonContract.load("companion-query-definitions", bundle: bundle)
        let mutation = try FolioleCompanionJsonContract.load("companion-mutation-definitions", bundle: bundle)
        let sync = try FolioleCompanionJsonContract.load("companion-sync-protocol-definitions", bundle: bundle)
        let statements = try Self.object(["statements"], mutation)
        let openState = try Self.object(["syncApplyMutations", "openState"], mutation)
        let runtime = try Self.object(["runtimeMutations"], mutation)
        let runtimeQueries = try Self.object(["runtimeQueries"], query)
        objectType = try Self.string(["syncObjectTypes", "nodeOpenState"], sync)
        payloadQuerySQL = try Self.string(["queries", "syncPayloadNodeOpenState", "sql"], query)
        upsertSQL = try Self.statement("upsertMutationName", openState, statements)
        let state = try Self.object(["syncState"], runtime)
        stateUpsertSQL = try Self.statement("upsertMutationName", state, statements)
        let ack = try Self.object(["syncPushAck"], runtime)
        pushAckDeleteSQL = try Self.statement("deleteByObjectMutationName", ack, statements)
        pushAckTable = try Self.value("tableName", ack)
        existingStateSQL = try Self.runtimeQuery("existingState", runtimeQueries, query)
        nextStateSeqSQL = try Self.runtimeQuery("nextStateSeq", runtimeQueries, query)
        metaValueSQL = try Self.runtimeQuery("companionMeta", runtimeQueries, query)
    }

    private static func runtimeQuery(_ name: String, _ runtime: [String: Any], _ root: [String: Any]) throws -> String {
        let queryName = try value("queryName", object([name], runtime))
        return try string(["queries", queryName, "sql"], root)
    }

    private static func statement(_ key: String, _ group: [String: Any], _ statements: [String: Any]) throws -> String {
        try value(try value(key, group), statements)
    }

    private static func object(_ path: [String], _ root: [String: Any]) throws -> [String: Any] {
        try FolioleCompanionJsonContract.object(path, in: root)
    }

    private static func string(_ path: [String], _ root: [String: Any]) throws -> String {
        try FolioleCompanionJsonContract.string(path, in: root)
    }

    private static func value(_ key: String, _ root: [String: Any]) throws -> String {
        guard let value = root[key] as? String, !value.isEmpty else { throw FolioleCompanionJsonContract.error(key) }
        return value
    }
}
