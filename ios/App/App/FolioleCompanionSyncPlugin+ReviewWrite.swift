import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func saveSyncNodeReviewRecord(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionReviewWriteContract()
            let nodeIdKey = try contract.key("nodeId", in: contract.payloadKeys)
            let inputKey = try contract.key("input", in: contract.payloadKeys)
            guard let nodeId = call.getString(nodeIdKey) else {
                throw reviewWriteError("\(nodeIdKey) is required")
            }
            guard let reviewJson = call.getString(inputKey) else {
                throw reviewWriteError("\(inputKey) is required")
            }
            let reviewLogJson = call.getString(try contract.key("reviewLog", in: contract.payloadKeys))
            let store = try FolioleCompanionReviewWriteStore(
                databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(), contract: contract
            )
            call.resolve(try store.save(
                nodeId: nodeId, reviewJson: reviewJson, reviewLogJson: reviewLogJson
            ))
        } catch { call.reject("Failed to save companion node review: \(error.localizedDescription)") }
    }

    private func reviewWriteError(_ detail: String) -> NSError {
        NSError(
            domain: "FolioleCompanionReviewWritePlugin", code: 1,
            userInfo: [NSLocalizedDescriptionKey: detail]
        )
    }
}
