import Capacitor

extension FolioleCompanionSyncPlugin {
    @objc func diagnoseSync(_ call: CAPPluginCall) {
        do {
            let pairingContract = try FolioleCompanionContractStore().pairingContract()
            let store = try FolioleCompanionSyncDiagnosticsStore(
                databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(),
                pairingState: { try FolioleCompanionPairingStore(contract: pairingContract).loadState() }
            )
            call.resolve(try store.diagnose())
        } catch {
            call.reject("Failed to diagnose companion sync: \(error.localizedDescription)")
        }
    }
}
