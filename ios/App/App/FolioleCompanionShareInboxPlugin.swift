import Capacitor
import UIKit

@objc(FolioleCompanionShareInboxPlugin)
public final class FolioleCompanionShareInboxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FolioleCompanionShareInboxPlugin"
    public let jsName = "FolioleCompanionShareInbox"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadPendingShares", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgeShare", returnType: CAPPluginReturnPromise)
    ]
    private var activeObserver: NSObjectProtocol?

    public override func load() {
        activeObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.notifyListeners("shareInboxChanged", data: [:]) }
    }

    deinit {
        if let activeObserver { NotificationCenter.default.removeObserver(activeObserver) }
    }

    @objc func loadPendingShares(_ call: CAPPluginCall) {
        do {
            let items = try FolioleShareInboxQueue.load().map { item in
                ["delivery_id": item.deliveryID, "received_at": item.receivedAt,
                 "parts": item.parts.map { ["kind": $0.kind, "value": $0.value] }] as [String: Any]
            }
            call.resolve(["items": items])
        } catch { call.reject("Failed to load shared text.", nil, error) }
    }

    @objc func acknowledgeShare(_ call: CAPPluginCall) {
        guard let deliveryID = call.getString("delivery_id"), !deliveryID.isEmpty else {
            call.reject("A delivery_id is required.")
            return
        }
        do {
            try FolioleShareInboxQueue.acknowledge(deliveryID: deliveryID)
            call.resolve()
        } catch { call.reject("Failed to acknowledge shared text.", nil, error) }
    }
}
