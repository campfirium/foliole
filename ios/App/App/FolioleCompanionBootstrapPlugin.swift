import Capacitor
import Foundation
import UIKit

@objc(FolioleCompanionBootstrapPlugin)
public class FolioleCompanionBootstrapPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FolioleCompanionBootstrapPlugin"
    public let jsName = "FolioleCompanionBootstrap"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadBootstrap", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeClipboardText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readClipboardText", returnType: CAPPluginReturnPromise)
    ]

    @objc func writeClipboardText(_ call: CAPPluginCall) {
        guard let text = call.getString("text") else {
            call.reject("Clipboard text is required.")
            return
        }
        DispatchQueue.main.async {
            UIPasteboard.general.string = text
            call.resolve()
        }
    }

    @objc func readClipboardText(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let pasteboard = UIPasteboard.general
            guard pasteboard.hasStrings else {
                call.resolve(["text": ""])
                return
            }
            guard let text = pasteboard.string else {
                call.reject("Could not read the clipboard. Allow paste access and try again.")
                return
            }
            call.resolve(["text": text])
        }
    }

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
