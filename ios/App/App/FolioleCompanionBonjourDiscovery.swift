import Foundation

final class FolioleCompanionBonjourDiscovery: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    private var browser: NetServiceBrowser?
    private let completion: ([[String: Any]]) -> Void
    private let contract: FolioleCompanionPairingContract
    private var finished = false
    private var results: [[String: Any]] = []
    private var services: [NetService] = []

    init(contract: FolioleCompanionPairingContract, completion: @escaping ([[String: Any]]) -> Void) {
        self.completion = completion
        self.contract = contract
        super.init()
    }

    func start() {
        DispatchQueue.main.async { [weak self] in self?.startOnMainRunLoop() }
    }

    private func startOnMainRunLoop() {
        guard !finished else { return }
        let browser = NetServiceBrowser()
        self.browser = browser
        browser.delegate = self
        browser.searchForServices(ofType: "_foliole-sync._tcp.", inDomain: "local.")
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in self?.finish() }
    }

    func netServiceBrowser(
        _ browser: NetServiceBrowser,
        didFind service: NetService,
        moreComing: Bool
    ) {
        services.append(service)
        service.delegate = self
        service.resolve(withTimeout: 1.0)
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        guard let host = sender.hostName?.trimmingCharacters(in: CharacterSet(charactersIn: ".")), !host.isEmpty else {
            return
        }
        let endpoint = "http://\(host):\(sender.port)"
        guard !results.contains(where: { $0[endpointKey] as? String == endpoint }) else { return }
        var candidate: [String: Any] = [endpointKey: endpoint, sourceKey: "nsd"]
        if let data = sender.txtRecordData() {
            candidate[protocolTxtKey] = Self.decodeTXT(data)
        }
        results.append(candidate)
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) {
        finish()
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        browser?.stop()
        browser = nil
        services.forEach { $0.stop() }
        completion(results)
    }

    private var endpointKey: String { networkCandidateKey("endpointUrl") }
    private var protocolTxtKey: String { networkCandidateKey("protocolTxt") }
    private var sourceKey: String { networkCandidateKey("source") }

    private func networkCandidateKey(_ name: String) -> String {
        contract.discoveryCandidateKeys[name] ?? "invalid.\(name)"
    }

    private static func decodeTXT(_ data: Data) -> [String: String] {
        NetService.dictionary(fromTXTRecord: data).reduce(into: [:]) { result, entry in
            if let value = String(data: entry.value, encoding: .utf8) { result[entry.key] = value }
        }
    }
}
