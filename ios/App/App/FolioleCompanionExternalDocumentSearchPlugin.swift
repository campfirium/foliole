import Capacitor

extension FolioleCompanionSyncPlugin {
    @objc func loadExternalDirectory(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionExternalDocumentSearchContractStore().contract()
            let store = try FolioleCompanionExternalDocumentSearchStore(
                databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(),
                contract: contract
            )
            call.resolve(try store.loadDirectory())
        } catch {
            call.reject("Failed to load companion external directory: \(error.localizedDescription)")
        }
    }

    @objc func loadExternalDocument(_ call: CAPPluginCall) {
        do {
            guard let documentId = call.getString("document_id") else {
                call.reject("Failed to load companion external document: document_id is required.")
                return
            }
            let contract = try FolioleCompanionExternalDocumentSearchContractStore().contract()
            let store = try FolioleCompanionExternalDocumentSearchStore(
                databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(),
                contract: contract
            )
            call.resolve(try store.load(documentId: documentId))
        } catch {
            call.reject("Failed to load companion external document: \(error.localizedDescription)")
        }
    }

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
