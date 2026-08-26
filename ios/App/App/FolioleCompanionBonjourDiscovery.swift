import Foundation
import Network

final class FolioleCompanionBonjourDiscoveryPool {
    private var active: [UUID: FolioleCompanionBonjourDiscovery] = [:]
    private var session: FolioleCompanionBonjourDiscoverySession?

    func start(contract: FolioleCompanionNetworkContract, completion: @escaping ([[String: Any]]) -> Void) {
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

    func startSession(
        contract: FolioleCompanionNetworkContract,
        onEvent: @escaping ([String: Any]) -> Void
    ) -> [String: Any] {
        session?.stop()
        let next = FolioleCompanionBonjourDiscoverySession(contract: contract, onEvent: onEvent)
        session = next
        return next.start()
    }

    func stopSession() -> [String: Any] {
        session?.stop()
        session = nil
        return Self.event(change: "stopped", status: "stopped", candidates: [])
    }

    fileprivate static func event(
        change: String, status: String, candidates: [[String: Any]], error: String? = nil
    ) -> [String: Any] {
        ["change": change, "status": status, "error_code": error as Any, "candidates": candidates]
    }
}

final class FolioleCompanionBonjourDiscoverySession: NSObject, NetServiceDelegate {
    private var browser: NWBrowser?
    private var results: [String: [String: Any]] = [:]
    private var services: [String: NetService] = [:]
    private let contract: FolioleCompanionNetworkContract
    private let onEvent: ([String: Any]) -> Void

    init(contract: FolioleCompanionNetworkContract, onEvent: @escaping ([String: Any]) -> Void) {
        self.contract = contract
        self.onEvent = onEvent
    }

    func start() -> [String: Any] {
        let browser = NWBrowser(for: .bonjour(type: "_foliole-sync._tcp", domain: "local."), using: .tcp)
        self.browser = browser
        browser.browseResultsChangedHandler = { [weak self] results, changes in
            DispatchQueue.main.async { self?.update(results: results, changes: changes) }
        }
        browser.stateUpdateHandler = { [weak self] state in
            DispatchQueue.main.async { self?.update(state: state) }
        }
        browser.start(queue: .main)
        return event(change: "started", status: "searching")
    }

    func stop() {
        browser?.cancel()
        browser = nil
        services.values.forEach { $0.stop() }
        services.removeAll()
        results.removeAll()
        onEvent(event(change: "stopped", status: "stopped"))
    }

    private func update(state: NWBrowser.State) {
        switch state {
        case .ready: onEvent(event(change: "started", status: "searching"))
        case .waiting(let error):
            onEvent(event(change: "failed", status: Self.isPermissionDenied(error) ? "permission_required" : "unavailable", error: "\(error)"))
        case .failed(let error): onEvent(event(change: "failed", status: "unavailable", error: "\(error)"))
        case .cancelled: break
        default: break
        }
    }

    private func update(results next: Set<NWBrowser.Result>, changes: Set<NWBrowser.Result.Change>) {
        let previous = Set(services.keys)
        let live = Set(next.compactMap(Self.key))
        let lost = previous.subtracting(live)
        let found = live.subtracting(previous)
        lost.forEach { services.removeValue(forKey: $0)?.stop(); results.removeValue(forKey: $0) }
        next.forEach(resolve)
        let change = !lost.isEmpty ? "lost" : !found.isEmpty ? "found" : "changed"
        onEvent(event(change: change, status: self.results.isEmpty ? "searching" : "results"))
    }

    private func resolve(_ result: NWBrowser.Result) {
        guard case let .service(name, type, domain, _) = result.endpoint else { return }
        let key = "\(name)|\(type)|\(domain)"
        guard services[key] == nil else { return }
        let service = NetService(domain: domain, type: type, name: name)
        services[key] = service
        service.delegate = self
        service.resolve(withTimeout: 3)
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        guard let entry = services.first(where: { $0.value === sender }),
              let host = sender.hostName?.trimmingCharacters(in: CharacterSet(charactersIn: ".")) else { return }
        var candidate: [String: Any] = [candidateKey("endpointUrl"): "http://\(host):\(sender.port)", candidateKey("source"): "nsd"]
        if let data = sender.txtRecordData() { candidate[candidateKey("protocolTxt")] = Self.decodeTXT(data) }
        let change = results[entry.key] == nil ? "found" : "changed"
        results[entry.key] = candidate
        onEvent(event(change: change, status: "results"))
    }

    private func event(change: String, status: String, error: String? = nil) -> [String: Any] {
        FolioleCompanionBonjourDiscoveryPool.event(change: change, status: status,
            candidates: Array(results.values), error: error)
    }
    private func candidateKey(_ name: String) -> String { contract.discoveryCandidateKeys[name] ?? "invalid.\(name)" }
    private static func key(_ result: NWBrowser.Result) -> String? {
        guard case let .service(name, type, domain, _) = result.endpoint else { return nil }
        return "\(name)|\(type)|\(domain)"
    }
    private static func decodeTXT(_ data: Data) -> [String: String] {
        NetService.dictionary(fromTXTRecord: data).compactMapValues { String(data: $0, encoding: .utf8) }
    }
    private static func isPermissionDenied(_ error: NWError) -> Bool {
        if case let .dns(code) = error { return code == -65570 }
        return false
    }
}

final class FolioleCompanionBonjourDiscovery: NSObject, NetServiceDelegate {
    private var browser: NWBrowser?
    private let completion: ([[String: Any]]) -> Void
    private let contract: FolioleCompanionNetworkContract
    private var finished = false
    private var results: [[String: Any]] = []
    private var services: [NetService] = []
    private var serviceKeys = Set<String>()

    init(contract: FolioleCompanionNetworkContract, completion: @escaping ([[String: Any]]) -> Void) {
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
