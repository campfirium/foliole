import Foundation

final class FolioleCompanionReviewWriteStore {
    private let contract: FolioleCompanionReviewWriteContract
    private let database: FolioleCompanionLearningWriteDatabase
    private let makeUuid: () -> String

    init(
        databaseURL: URL,
        contract: FolioleCompanionReviewWriteContract,
        makeUuid: @escaping () -> String = { UUID().uuidString.lowercased() }
    ) throws {
        self.contract = contract
        self.makeUuid = makeUuid
        database = try FolioleCompanionLearningWriteDatabase(url: databaseURL)
    }

    func save(nodeId rawNodeId: String, reviewJson: String, reviewLogJson: String?) throws -> [String: Any] {
        guard let nodeId = FolioleCompanionLearningWriteDatabase.normalized(rawNodeId) else {
            throw error("node_id is required")
        }
        var payload = try parseObject(reviewJson, name: "review_json")
        payload[try key("nodeId")] = nodeId
        let contentHash = try FolioleCompanionLearningWriteDatabase.contentHash(payload)
        let deviceId = try database.canonicalDeviceId(contract)
        var opId: String?
        try database.transaction {
            let timestamp = FolioleCompanionLearningWriteDatabase.timestamp()
            try upsertReview(nodeId, payload)
            if let reviewLogJson {
                opId = try insertReviewLog(nodeId, reviewLogJson, deviceId)
            }
            try database.writeDirtyState(
                contract: contract, objectId: nodeId, contentHash: contentHash,
                deviceId: deviceId, timestamp: timestamp
            )
        }
        var result: [String: Any] = [
            try contract.key("objectId", in: contract.resultKeys): nodeId,
            try contract.key("contentHash", in: contract.resultKeys): contentHash
        ]
        if let opId { result[try contract.key("opId", in: contract.resultKeys)] = opId }
        return result
    }

    private func upsertReview(_ nodeId: String, _ payload: [String: Any]) throws {
        try database.execute(contract.reviewUpsertSQL, bindings: [
            .text(nodeId), .text(try requiredString("due", payload)), nullableText("lastReviewAt", payload),
            .integer(try integer("state", payload)), .double(try double("stability", payload)),
            .double(try double("difficulty", payload)), .integer(try integer("elapsedDays", payload)),
            .integer(try integer("scheduledDays", payload)), .integer(try integer("reps", payload)),
            .integer(try integer("lapses", payload))
        ])
    }

    private func insertReviewLog(_ nodeId: String, _ json: String, _ deviceId: String) throws -> String {
        let draft = try parseObject(json, name: "review_log_json")
        let before = try requiredObject("cardBefore", draft)
        let after = try requiredObject("cardAfter", draft)
        let opId = makeUuid()
        let record: [String: Any] = [
            "id": makeUuid(), "op_id": opId, "device_id": deviceId, "node_id": nodeId,
            "grade": try requiredNumber("grade", draft),
            "scheduler_version": try requiredString("schedulerVersion", draft),
            "reviewed_at": try requiredString("reviewedAt", draft),
            "due_before": try requiredString("due", before),
            "stability_before": try requiredNumber("stability", before),
            "difficulty_before": try requiredNumber("difficulty", before),
            "due_after": try requiredString("due", after),
            "stability_after": try requiredNumber("stability", after),
            "difficulty_after": try requiredNumber("difficulty", after)
        ]
        let bindings = try contract.reviewLogColumnKeys.map { try binding(record, $0) }
        try database.execute(contract.reviewLogInsertSQL, bindings: bindings)
        return opId
    }

    private func parseObject(_ json: String, name: String) throws -> [String: Any] {
        guard let data = json.data(using: .utf8),
              let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw error("\(name) must be an object")
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

    private func nullableText(_ name: String, _ payload: [String: Any]) -> FolioleCompanionLearningBinding {
        guard let key = try? key(name), let value = payload[key] as? String, !value.isEmpty else { return .null }
        return .text(value)
    }

    private func requiredObject(_ name: String, _ root: [String: Any]) throws -> [String: Any] {
        guard let value = root[try key(name)] as? [String: Any] else { throw error("\(name) is required") }
        return value
    }

    private func requiredString(_ name: String, _ root: [String: Any]) throws -> String {
        guard let value = root[try key(name)] as? String,
              let normalized = FolioleCompanionLearningWriteDatabase.normalized(value) else {
            throw error("\(name) is required")
        }
        return normalized
    }

    private func requiredNumber(_ name: String, _ root: [String: Any]) throws -> NSNumber {
        guard let value = root[try key(name)] as? NSNumber else { throw error("\(name) is required") }
        return value
    }

    private func binding(_ record: [String: Any], _ key: String) throws -> FolioleCompanionLearningBinding {
        guard let value = record[key] else { throw error("review log field \(key) is unavailable") }
        if let value = value as? String { return .text(value) }
        if let value = value as? NSNumber {
            let type = String(cString: value.objCType)
            return type == "f" || type == "d" ? .double(value.doubleValue) : .integer(value.intValue)
        }
        throw error("review log field \(key) has an unsupported type")
    }

    private func error(_ text: String) -> NSError {
        NSError(domain: "FolioleCompanionReviewWriteStore", code: 1,
                userInfo: [NSLocalizedDescriptionKey: text])
    }
}
