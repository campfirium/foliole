import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func saveSyncNodeReadingRecord(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionReadingWriteContract()
            let nodeId = call.getString(try contract.key("nodeId", in: contract.payloadKeys)) ?? ""
            let readingJson = call.getString(try contract.key("input", in: contract.payloadKeys)) ?? "{}"
            let store = try FolioleCompanionReadingWriteStore(
                databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(), contract: contract
            )
            call.resolve(try store.save(nodeId: nodeId, readingJson: readingJson))
        } catch { call.reject("Failed to save companion node reading: \(error.localizedDescription)") }
    }
}
