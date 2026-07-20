import Capacitor

extension FolioleCompanionSyncPlugin {
    @objc func loadSyncIndex(_ call: CAPPluginCall) {
        do {
            call.resolve(try syncObjectReadStore().loadIndex())
        } catch {
            call.reject("Failed to load companion sync index: \(error.localizedDescription)")
        }
    }

    @objc func loadSyncObjects(_ call: CAPPluginCall) {
        do {
            let objectIds = call.getArray("object_ids")?.compactMap { $0 as? String } ?? []
            let objectTypes = call.getArray("object_types")?.compactMap { $0 as? String } ?? []
            call.resolve(try syncObjectReadStore().loadObjects(objectIds: objectIds, objectTypes: objectTypes))
        } catch {
            call.reject("Failed to load companion sync objects: \(error.localizedDescription)")
        }
    }

    private func syncObjectReadStore() throws -> FolioleCompanionSyncObjectReadStore {
        try FolioleCompanionSyncObjectReadStore(
            databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(),
            contract: FolioleCompanionSyncObjectReadContractStore().contract()
        )
    }
}
