import Foundation

extension FolioleCompanionSyncGroupDataRequesting {
    func request(_ operation: String, _ payload: [String: Any],
        documentOwner: FolioleFramedSyncPayloadBudget) throws -> [String: Any] {
        try documentOwner.requireActive()
        return try request(operation, payload)
    }
}

struct FolioleFramedSyncOwnedBridge: FolioleCompanionSyncGroupDataRequesting {
    let bridge: FolioleCompanionSyncGroupDataRequesting
    let owner: FolioleFramedSyncPayloadBudget

    func request(_ operation: String, _ payload: [String: Any]) throws -> [String: Any] {
        try owner.requireActive()
        return try bridge.request(operation, payload, documentOwner: owner)
    }
}
