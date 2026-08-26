import Capacitor
#if FOLIOLE_IOS_BRIDGE_ACCEPTANCE && targetEnvironment(simulator)
import Foundation
import WebKit
#endif

final class FolioleBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FolioleCompanionBootstrapPlugin())
        bridge?.registerPluginInstance(FolioleCompanionSyncPlugin())
        bridge?.registerPluginInstance(FolioleCompanionSyncPackTransferPlugin())
#if FOLIOLE_IOS_BRIDGE_ACCEPTANCE && targetEnvironment(simulator)
        bridge?.registerPluginInstance(FolioleCompanionSyncGroupJoinPreparePlugin())
        webView?.configuration.userContentController.add(self, name: Self.acceptanceHandler)
#endif
    }
}

#if FOLIOLE_IOS_BRIDGE_ACCEPTANCE && targetEnvironment(simulator)
extension FolioleBridgeViewController: WKScriptMessageHandler {
    private static let acceptanceHandler = "folioleBridgeAcceptance"

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.acceptanceHandler,
              let body = prepareAcceptanceBody(message.body),
              JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body, options: [.prettyPrinted, .sortedKeys])
        else { return }
        let directory = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("FolioleBridgeAcceptance", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: directory.appendingPathComponent("result.json"), options: .atomic)
    }

    private func prepareAcceptanceBody(_ body: Any) -> [String: Any]? {
        guard var result = body as? [String: Any] else { return nil }
        guard result["scenario"] as? String == "device-identity" else { return result }
        do {
            result["device_anchor"] = try FolioleCompanionDeviceAnchorStore().loadOrCreate()
            result["anchor_storage"] = "keychain-after-first-unlock-this-device-only"
            if let path = result["database_path"] as? String {
                result["canonical_database_path"] = try FolioleCompanionDeviceAnchorStore.canonicalLibraryPath(path)
            }
        } catch {
            result["error"] = error.localizedDescription
            result["phase"] = "failed"
            result["status"] = "failed"
        }
        return result
    }
}
#endif
