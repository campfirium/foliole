import Capacitor

extension FolioleCompanionSyncPlugin {
    @objc func searchTopics(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionContractStore().topicSearchContract()
            let queryKey = contract.requestKeys["query"] ?? "invalid.query"
            guard let query = call.getString(queryKey) else {
                call.reject("Failed to search companion topics: query is required.")
                return
            }
            let limitKey = contract.requestKeys["limit"] ?? "invalid.limit"
            let store = try FolioleCompanionTopicSearchStore(
                databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(),
                contract: contract
            )
            call.resolve(try store.search(query: query, limit: call.getInt(limitKey)))
        } catch {
            call.reject("Failed to search companion topics: \(error.localizedDescription)")
        }
    }
}
