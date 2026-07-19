import Capacitor

final class FolioleBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FolioleCompanionBootstrapPlugin())
    }
}
