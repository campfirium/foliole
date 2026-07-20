import Foundation

final class FolioleCompanionSyncObjectReadStore {
    private let contract: FolioleCompanionSyncObjectReadContract
    private let queries: FolioleCompanionGeneratedReadQueryRunner

    init(databaseURL: URL, contract: FolioleCompanionSyncObjectReadContract) throws {
        self.contract = contract
        queries = try FolioleCompanionGeneratedReadQueryRunner(databaseURL: databaseURL)
    }

    func loadIndex() throws -> [String: Any] {
        [contract.syncIndexQuery.resultKey: try queries.rows(contract.syncIndexQuery)]
    }

    func loadObjects(objectIds: [String], objectTypes: [String]) throws -> [String: Any] {
        let ids = normalized(objectIds)
        let types = normalized(objectTypes)
        guard !ids.isEmpty else { return [contract.syncObjectsQuery.resultKey: []] }
        let query = contract.syncObjectsQuery.replacing([
            contract.objectIdsReplacement: placeholders(ids.count),
            contract.objectTypesReplacement: types.isEmpty
                ? contract.unfilteredObjectTypesReplacement
                : placeholders(types.count)
        ])
        let bindings = ids.map(FolioleReadOnlySQLite.Binding.string)
            + [.integer(types.count)]
            + types.map(FolioleReadOnlySQLite.Binding.string)
        let rows = try queries.typedRows(query, bindings: bindings)
        return [query.resultKey: try rows.map(loadPayload)]
    }

    private func loadPayload(_ row: [String: Any]) throws -> [String: Any] {
        var result = row
        guard row[contract.deletedAtKey] is NSNull else {
            result[contract.payloadJsonKey] = NSNull()
            return result
        }
        let objectType = try string(contract.objectTypeKey, row: row)
        let objectId = try string(contract.objectIdKey, row: row)
        result[contract.payloadJsonKey] = try payload(objectType: objectType, objectId: objectId)
        return result
    }

    private func payload(objectType: String, objectId: String) throws -> String {
        let objectIdKey = scopedPart(objectId, index: contract.objectIdKeyPartIndex) ?? objectId
        guard let route = contract.routes.first(where: { matches($0, objectType: objectType, objectIdKey: objectIdKey) }) else {
            return "{}"
        }
        let rows = try queries.rows(route.query, arguments: arguments(route, objectId: objectId, objectIdKey: objectIdKey))
        guard let row = rows.first else { return "{}" }
        if let payload = row[contract.payloadJsonKey] as? String { return payload }
        let data = try JSONSerialization.data(withJSONObject: row, options: [.sortedKeys])
        return String(decoding: data, as: UTF8.self)
    }

    private func arguments(_ route: FolioleCompanionSyncPayloadRoute, objectId: String, objectIdKey: String) -> [String] {
        if route.argMode == contract.noneArgMode { return [] }
        if route.argMode == contract.viewStateNodeArgMode, let prefix = route.objectIdPrefix {
            let deviceId = scopedPart(objectId, index: contract.objectIdDeviceIdPartIndex) ?? contract.defaultDeviceId
            return [String(objectIdKey.dropFirst(prefix.count)), deviceId]
        }
        return [objectId]
    }

    private func matches(_ route: FolioleCompanionSyncPayloadRoute, objectType: String, objectIdKey: String) -> Bool {
        guard route.objectType == objectType else { return false }
        if let exact = route.objectIdKey { return exact == objectIdKey }
        if let prefix = route.objectIdPrefix { return objectIdKey.hasPrefix(prefix) }
        return true
    }

    private func scopedPart(_ objectId: String, index: Int) -> String? {
        let parts = objectId.components(separatedBy: contract.objectIdDelimiter)
        guard parts.count == contract.objectIdPartLimit, parts.indices.contains(index) else { return nil }
        return parts[index]
    }

    private func normalized(_ values: [String]) -> [String] {
        values.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }

    private func placeholders(_ count: Int) -> String {
        Array(repeating: "?", count: count).joined(separator: ", ")
    }

    private func string(_ key: String, row: [String: Any]) throws -> String {
        guard let value = row[key] as? String else {
            throw NSError(
                domain: "FolioleCompanionSyncObjectRead",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Sync object row is missing \(key)."]
            )
        }
        return value
    }
}
