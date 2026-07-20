import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func saveSyncNodeReadingRecord(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionReadingWriteContract()
            let nodeIdKey = try contract.key("nodeId", in: contract.payloadKeys)
            let inputKey = try contract.key("input", in: contract.payloadKeys)
            guard let nodeId = call.getString(nodeIdKey) else {
                throw readingWriteError("\(nodeIdKey) is required")
            }
            guard let readingJson = call.getString(inputKey) else {
                throw readingWriteError("\(inputKey) is required")
            }
            let store = try FolioleCompanionReadingWriteStore(
                databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(), contract: contract
            )
            call.resolve(try store.save(nodeId: nodeId, readingJson: readingJson))
        } catch { call.reject("Failed to save companion node reading: \(error.localizedDescription)") }
    }

    private func readingWriteError(_ detail: String) -> NSError {
        NSError(
            domain: "FolioleCompanionReadingWritePlugin", code: 1,
            userInfo: [NSLocalizedDescriptionKey: detail]
        )
    }
}
