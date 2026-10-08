import Capacitor
import Foundation
import WebKit

/** Observe only the product document boundary; Capacitor retains all of its navigation behavior. */
final class FolioleFramedSyncWebViewLifecycle: NSObject, WKNavigationDelegate {
    private let original: WKNavigationDelegate
    private let plugin: FolioleCompanionSyncPlugin
    private lazy var document = FolioleFramedSyncDocumentOwner { [weak self] captured in
        self?.invalidate(captured)
    }

    init(original: WKNavigationDelegate, plugin: FolioleCompanionSyncPlugin) {
        self.original = original; self.plugin = plugin
        super.init()
    }

    func configured(_ owner: FolioleFramedSyncPayloadBudget) { document.configured(owner) }

    override func responds(to selector: Selector!) -> Bool {
        super.responds(to: selector) || (original as AnyObject).responds(to: selector)
    }

    override func forwardingTarget(for selector: Selector!) -> Any? {
        (original as AnyObject).responds(to: selector) ? original : super.forwardingTarget(for: selector)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        document.started()
        original.webView?(webView, didStartProvisionalNavigation: navigation)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        document.committed()
        original.webView?(webView, didCommit: navigation)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        document.failed()
        original.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        document.terminated()
        original.webViewWebContentProcessDidTerminate?(webView)
    }

    private func invalidate(_ captured: FolioleFramedSyncPayloadBudget) {
        plugin.groupData.cancelPending(documentOwner: captured)
        FolioleFramedSyncPayloadBudgetRegistry.shared.invalidateDocument(captured)
    }
}
