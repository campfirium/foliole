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

    @objc func loadBootstrap(_ call: CAPPluginCall) {
        call.resolve([
            "booted_at": ISO8601DateFormatter().string(from: Date()),
            "database_path": NSNull(),
            "database_ready": false,
            "host_name": loadHostName(),
            "runtime_kind": "ios-capacitor"
        ])
    }

    private func loadHostName() -> String {
        let current = UIDevice.current.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let profile = current.isEmpty ? UIDevice.current.model : current
        return profile
    }
}
