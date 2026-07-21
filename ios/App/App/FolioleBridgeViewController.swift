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
        webView?.configuration.userContentController.add(self, name: Self.acceptanceHandler)
#endif
    }
}

#if FOLIOLE_IOS_BRIDGE_ACCEPTANCE && targetEnvironment(simulator)
extension FolioleBridgeViewController: WKScriptMessageHandler {
    private static let acceptanceHandler = "folioleBridgeAcceptance"

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.acceptanceHandler,
              JSONSerialization.isValidJSONObject(message.body),
              let data = try? JSONSerialization.data(withJSONObject: message.body, options: [.prettyPrinted, .sortedKeys])
        else { return }
        let directory = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("FolioleBridgeAcceptance", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: directory.appendingPathComponent("result.json"), options: .atomic)
    }
}
#endif
