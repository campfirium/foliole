import Capacitor
import Foundation
import UIKit

@objc(FolioleCompanionBootstrapPlugin)
public class FolioleCompanionBootstrapPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FolioleCompanionBootstrapPlugin"
    public let jsName = "FolioleCompanionBootstrap"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadBootstrap", returnType: CAPPluginReturnPromise)
    ]

    private static let legacyDeviceIdKey = "foliole-companion-ios-device-id"

    @objc func loadBootstrap(_ call: CAPPluginCall) {
        do {
            let deviceProfile = try loadDeviceProfile()
            call.resolve([
                "booted_at": ISO8601DateFormatter().string(from: Date()),
                "database_path": NSNull(),
                "database_ready": false,
                "device_id": deviceProfile,
                "device_name": deviceProfile,
                "runtime_kind": "ios-capacitor"
            ])
        } catch {
            call.reject("Failed to bootstrap Foliole companion runtime: \(error.localizedDescription)")
        }
    }

    private func loadDeviceProfile() throws -> String {
        let current = UIDevice.current.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let profile = current.isEmpty ? UIDevice.current.model : current
        let defaults = UserDefaults.standard
        let legacy = defaults.string(forKey: Self.legacyDeviceIdKey)?.trimmedNonempty
        let pairing = try FolioleCompanionPairingStore(
            contract: FolioleCompanionContractStore().pairingContract()
        )
        if (legacy != nil && legacy != profile) || (pairing.storedDeviceId != nil && pairing.storedDeviceId != profile) {
            _ = try pairing.clear()
        }
        defaults.removeObject(forKey: Self.legacyDeviceIdKey)
        return profile
    }
}

private extension String {
    var trimmedNonempty: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
