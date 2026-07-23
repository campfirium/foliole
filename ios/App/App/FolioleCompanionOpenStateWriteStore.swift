import Foundation

final class FolioleCompanionOpenStateWriteStore {
    private let contract: FolioleCompanionOpenStateWriteContract
    private let database: FolioleCompanionLearningWriteDatabase

    init(databaseURL: URL, contract: FolioleCompanionOpenStateWriteContract) throws {
        self.contract = contract
        database = try FolioleCompanionLearningWriteDatabase(url: databaseURL)
    }

    func save(nodeId rawNodeId: String, lastOpenedAt rawLastOpenedAt: String) throws -> [String: Any] {
        guard let nodeId = FolioleCompanionLearningWriteDatabase.normalized(rawNodeId),
              let lastOpenedAt = FolioleCompanionLearningWriteDatabase.normalized(rawLastOpenedAt) else {
            throw error("node_id and last_opened_at are required")
        }
        let deviceId = try database.canonicalDeviceId(contract)
        var contentHash = ""
        var persistedLastOpenedAt = lastOpenedAt
        try database.transaction {
            try database.execute(contract.upsertSQL, bindings: [.text(nodeId), .text(lastOpenedAt)])
            guard let payloadJson = try database.queryText(contract.payloadQuerySQL, bindings: [.text(nodeId)]),
                  let data = payloadJson.data(using: .utf8),
                  let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw error("node open state payload is unavailable")
            }
            persistedLastOpenedAt = payload["last_opened_at"] as? String ?? lastOpenedAt
            contentHash = try FolioleCompanionLearningWriteDatabase.contentHash(payload)
            try database.writeDirtyState(
                contract: contract, objectId: nodeId, contentHash: contentHash,
                deviceId: deviceId, timestamp: persistedLastOpenedAt
            )
        }
        return ["object_id": nodeId, "content_hash": contentHash, "last_opened_at": persistedLastOpenedAt]
    }

    private func error(_ text: String) -> NSError {
        NSError(domain: "FolioleCompanionOpenStateWriteStore", code: 1,
                userInfo: [NSLocalizedDescriptionKey: text])
    }
}
