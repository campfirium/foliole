import Capacitor
import Foundation

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
            let objectIds = try requiredStringArray(call, "object_ids")
            let objectTypes = try optionalStringArray(call, "object_types")
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

    private func requiredStringArray(_ call: CAPPluginCall, _ key: String) throws -> [String] {
        guard let values = call.getArray(key, String.self) else {
            throw syncObjectReadError("\(key) must be a string array.")
        }
        return values
    }

    private func optionalStringArray(_ call: CAPPluginCall, _ key: String) throws -> [String] {
        guard call.options[key] != nil else { return [] }
        return try requiredStringArray(call, key)
    }

    private func syncObjectReadError(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncObjectReadPlugin", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
