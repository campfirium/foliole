import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func saveSyncSettingRecord(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionSettingWriteContract()
            let key = try requiredSettingWriteValue(call, "key", contract)
            let valueJson = try requiredSettingWriteValue(call, "valueJson", contract)
            let store = try FolioleCompanionSettingWriteStore(
                databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(),
                contract: contract
            )
            call.resolve(try store.save(
                key: key,
                scope: try value(call, "scope", contract),
                platform: try value(call, "platform", contract),
                formFactor: try value(call, "formFactor", contract),
                deviceId: try value(call, "deviceId", contract),
                valueJson: valueJson
            ))
        } catch { call.reject("Failed to save companion setting: \(error.localizedDescription)") }
    }

    private func value(
        _ call: CAPPluginCall,
        _ name: String,
        _ contract: FolioleCompanionSettingWriteContract
    ) throws -> String {
        let key = try contract.key(name, in: contract.payloadKeys)
        let fallback = try contract.key(name, in: contract.defaults)
        return call.getString(key) ?? fallback
    }

    private func requiredSettingWriteValue(
        _ call: CAPPluginCall,
        _ name: String,
        _ contract: FolioleCompanionSettingWriteContract
    ) throws -> String {
        let payloadKey = try contract.key(name, in: contract.payloadKeys)
        guard let value = call.getString(payloadKey) else {
            throw NSError(
                domain: "FolioleCompanionSettingWritePlugin", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "\(payloadKey) is required"]
            )
        }
        return value
    }
}
