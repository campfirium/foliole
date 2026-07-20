import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func saveSyncNodeReviewRecord(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionReviewWriteContract()
            let nodeId = call.getString(try contract.key("nodeId", in: contract.payloadKeys)) ?? ""
            let reviewJson = call.getString(try contract.key("input", in: contract.payloadKeys)) ?? "{}"
            let reviewLogJson = call.getString(try contract.key("reviewLog", in: contract.payloadKeys))
            let store = try FolioleCompanionReviewWriteStore(
                databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(), contract: contract
            )
            call.resolve(try store.save(
                nodeId: nodeId, reviewJson: reviewJson, reviewLogJson: reviewLogJson
            ))
        } catch { call.reject("Failed to save companion node review: \(error.localizedDescription)") }
    }
}
