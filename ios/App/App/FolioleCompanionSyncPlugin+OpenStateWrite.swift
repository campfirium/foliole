import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func saveSyncNodeOpenState(_ call: CAPPluginCall) {
        do {
            guard let nodeId = call.getString("node_id"),
                  let lastOpenedAt = call.getString("last_opened_at") else {
                throw NSError(
                    domain: "FolioleCompanionOpenStateWritePlugin", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "node_id and last_opened_at are required"]
                )
            }
            let contract = try FolioleCompanionOpenStateWriteContract()
            let store = try FolioleCompanionOpenStateWriteStore(
                databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(), contract: contract
            )
            call.resolve(try store.save(nodeId: nodeId, lastOpenedAt: lastOpenedAt))
        } catch { call.reject("Failed to save companion node open state: \(error.localizedDescription)") }
    }
}
