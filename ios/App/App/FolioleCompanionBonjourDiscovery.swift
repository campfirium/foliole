import Foundation
import Network

final class FolioleCompanionBonjourDiscoveryPool {
    private var active: [UUID: FolioleCompanionBonjourDiscovery] = [:]

    func start(contract: FolioleCompanionPairingContract, completion: @escaping ([[String: Any]]) -> Void) {
        DispatchQueue.main.async {
            let id = UUID()
            let discovery = FolioleCompanionBonjourDiscovery(contract: contract) { [weak self] candidates in
                self?.active[id] = nil
                completion(candidates)
            }
            self.active[id] = discovery
            discovery.start()
        }
    }
}

final class FolioleCompanionBonjourDiscovery: NSObject, NetServiceDelegate {
    private var browser: NWBrowser?
    private let completion: ([[String: Any]]) -> Void
    private let contract: FolioleCompanionPairingContract
    private var finished = false
    private var results: [[String: Any]] = []
    private var services: [NetService] = []
    private var serviceKeys = Set<String>()

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
        let browser = NWBrowser(
            for: .bonjour(type: "_foliole-sync._tcp", domain: "local."),
            using: .tcp
        )
        self.browser = browser
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            DispatchQueue.main.async { self?.resolve(results) }
        }
        browser.stateUpdateHandler = { [weak self] state in
            if case .failed = state { DispatchQueue.main.async { self?.finish() } }
        }
        browser.start(queue: .main)
        DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) { [weak self] in self?.finish() }
    }

    private func resolve(_ results: Set<NWBrowser.Result>) {
        for result in results {
            guard case let .service(name, type, domain, _) = result.endpoint else { continue }
            let key = "\(name)|\(type)|\(domain)"
            guard serviceKeys.insert(key).inserted else { continue }
            let service = NetService(domain: domain, type: type, name: name)
            services.append(service)
            service.delegate = self
            service.resolve(withTimeout: 3.0)
        }
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

    private func finish() {
        guard !finished else { return }
        finished = true
        browser?.cancel()
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
