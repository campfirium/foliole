import Foundation

final class FolioleCompanionReadingWriteStore {
    private let contract: FolioleCompanionReadingWriteContract
    private let database: FolioleCompanionLearningWriteDatabase

    init(databaseURL: URL, contract: FolioleCompanionReadingWriteContract) throws {
        self.contract = contract
        database = try FolioleCompanionLearningWriteDatabase(url: databaseURL)
    }

    func save(nodeId rawNodeId: String, readingJson: String) throws -> [String: Any] {
        guard let nodeId = FolioleCompanionLearningWriteDatabase.normalized(rawNodeId) else {
            throw error("node_id is required")
        }
        var payload = try parsePayload(readingJson)
        let deviceId = try database.canonicalDeviceId(contract)
        payload[try key("nodeId")] = nodeId
        payload[try key("deviceId")] = deviceId
        var hashPayload = payload
        contract.hashIgnoredPayloadKeys.forEach { hashPayload.removeValue(forKey: $0) }
        let contentHash = try FolioleCompanionLearningWriteDatabase.contentHash(hashPayload)
        try database.transaction {
            let timestamp = FolioleCompanionLearningWriteDatabase.timestamp()
            try upsertReading(nodeId, payload, deviceId, timestamp)
            try database.writeDirtyState(
                contract: contract, objectId: nodeId, contentHash: contentHash,
                deviceId: deviceId, timestamp: timestamp
            )
        }
        return [
            try contract.key("objectId", in: contract.resultKeys): nodeId,
            try contract.key("contentHash", in: contract.resultKeys): contentHash
        ]
    }

    private func upsertReading(
        _ nodeId: String, _ payload: [String: Any], _ deviceId: String, _ timestamp: String
    ) throws {
        try database.execute(contract.readingUpsertSQL, bindings: [
            .text(nodeId), .integer(try integer("intervalDurationMs", payload)),
            .double(try double("intervalGrowthFactor", payload)),
            .text(try string("lastHandledAt", payload, timestamp)),
            .text(try string("nextAt", payload, timestamp)), .double(try double("priority", payload)),
            .integer(try integer("repetitionCount", payload)), .text(try string("state", payload, "active"))
        ])
        try database.execute(contract.readingDeviceStateUpsertSQL, bindings: [
            .text(nodeId), .text(deviceId), .integer(try integer("readingPosition", payload)), .text(timestamp)
        ])
    }

    private func parsePayload(_ json: String) throws -> [String: Any] {
        guard let data = json.data(using: .utf8),
              let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw error("reading_json must be an object")
        }
        return value
    }

    private func key(_ name: String) throws -> String { try contract.key(name, in: contract.payloadKeys) }

    private func integer(_ name: String, _ payload: [String: Any]) throws -> Int {
        let value = payload[try key(name)] ?? contract.defaults[name]
        return (value as? NSNumber)?.intValue ?? 0
    }

    private func double(_ name: String, _ payload: [String: Any]) throws -> Double {
        let value = payload[try key(name)] ?? contract.defaults[name]
        return (value as? NSNumber)?.doubleValue ?? 0
    }

    private func string(_ name: String, _ payload: [String: Any], _ fallback: String) throws -> String {
        (payload[try key(name)] as? String) ?? (contract.defaults[name] as? String) ?? fallback
    }

    private func error(_ text: String) -> NSError {
        NSError(domain: "FolioleCompanionReadingWriteStore", code: 1,
                userInfo: [NSLocalizedDescriptionKey: text])
    }
}
