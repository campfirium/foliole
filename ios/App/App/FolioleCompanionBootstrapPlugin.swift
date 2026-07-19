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

    private static let deviceIdKey = "foliole-companion-ios-device-id"

    @objc func loadBootstrap(_ call: CAPPluginCall) {
        call.resolve([
            "booted_at": ISO8601DateFormatter().string(from: Date()),
            "database_path": NSNull(),
            "database_ready": false,
            "device_id": loadDeviceId(),
            "device_name": UIDevice.current.name,
            "runtime_kind": "ios-capacitor"
        ])
    }

    private func loadDeviceId() -> String {
        let defaults = UserDefaults.standard
        if let stored = defaults.string(forKey: Self.deviceIdKey), !stored.isEmpty {
            return stored
        }
        let created = "ios-\(UUID().uuidString.lowercased())"
        defaults.set(created, forKey: Self.deviceIdKey)
        return created
    }
}
