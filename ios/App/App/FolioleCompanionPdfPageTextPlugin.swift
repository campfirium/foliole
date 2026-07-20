import Capacitor

extension FolioleCompanionSyncPlugin {
    @objc func loadPdfPageText(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionPdfPageTextContractStore().contract()
            guard let attachmentId = call.getString(contract.attachmentIdKey) else {
                call.reject("Failed to load companion PDF page text: attachment_id is required.")
                return
            }
            call.resolve(try store(contract).load(attachmentId: attachmentId))
        } catch {
            call.reject("Failed to load companion PDF page text: \(error.localizedDescription)")
        }
    }

    @objc func searchPdfPageText(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionPdfPageTextContractStore().contract()
            guard let query = call.getString(contract.queryKey) else {
                call.reject("Failed to search companion PDF page text: query is required.")
                return
            }
            call.resolve(try store(contract).search(query: query, limit: call.getInt("limit")))
        } catch {
            call.reject("Failed to search companion PDF page text: \(error.localizedDescription)")
        }
    }

    private func store(_ contract: FolioleCompanionPdfPageTextContract) throws -> FolioleCompanionPdfPageTextStore {
        try FolioleCompanionPdfPageTextStore(
            databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(),
            contract: contract
        )
    }
}
