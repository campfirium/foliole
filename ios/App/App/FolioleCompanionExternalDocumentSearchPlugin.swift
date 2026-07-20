import Capacitor

extension FolioleCompanionSyncPlugin {
    @objc func searchExternalDocuments(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionExternalDocumentSearchContractStore().contract()
            guard let query = call.getString(contract.queryKey) else {
                call.reject("Failed to search companion external documents: query is required.")
                return
            }
            let store = try FolioleCompanionExternalDocumentSearchStore(
                databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(),
                contract: contract
            )
            call.resolve(try store.search(query: query, limit: call.getInt("limit")))
        } catch {
            call.reject("Failed to search companion external documents: \(error.localizedDescription)")
        }
    }
}
