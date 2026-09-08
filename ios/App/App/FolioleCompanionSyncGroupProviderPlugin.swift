import Capacitor
import Foundation
import Network

extension FolioleCompanionSyncPlugin {
    @objc func startSyncGroupProvider(_ call: CAPPluginCall) {
        runGroup(call, "Failed to start Sync Group provider") {
            guard let group = call.getObject("sync_group") else { throw self.invalid("sync_group_required") }
            let credential = try self.groupData.request(
                "load_current_credential", ["group_id": group["group_id"] as Any]
            )
            guard try self.required(credential, "device_id") == call.getString("device_id") else {
                throw self.invalid("sync_group_local_device_mismatch")
            }
            let workgroupKey = try self.required(credential, "workgroup_key")
            let info: [String: Any] = [
                "display_name": group["display_name"] as Any,
                "group_id": group["group_id"] as Any,
                "workgroup_key": workgroupKey
            ]
            let contract = try self.contract()
            let runtimeId = UUID().uuidString.lowercased()
            let discovery: [String: Any] = [
                "app_version": try self.requiredString(call, ["appVersion": "app_version"], "appVersion"),
                "facts_revision": try self.requiredString(call, ["factsRevision": "facts_revision"], "factsRevision"),
                "group_display_name": try self.required(group, "display_name"),
                "group_id": try self.required(group, "group_id"),
                "group_tag": try FolioleCompanionSyncGroupSecurity.groupTag(workgroupKey),
                "protocol_capabilities": contract.protocolCapabilities,
                "protocol_max_version": contract.protocolMaximumVersion,
                "protocol_min_version": contract.protocolMinimumVersion,
                "protocol_version": contract.protocolVersion,
                "provider_device_id": try self.requiredString(call, ["deviceId": "device_id"], "deviceId"),
                "provider_device_name": try self.requiredString(call, ["deviceName": "device_name"], "deviceName"),
                "provider_platform": try self.requiredString(call, ["platform": "platform"], "platform"),
                "runtime_instance_id": runtimeId
            ]
            let effectiveRuntimeId = try FolioleCompanionSyncGroupJoinService.shared.install(
                groupInfo: info, discovery: discovery, dataBridge: self.groupData,
                stateChanged: { [weak self] in self?.publishProviderState() }
            )
            let hint = try self.serviceHintContract()
            self.serviceMonitor.start(
                groupId: try self.required(group, "group_id"), localRuntimeId: effectiveRuntimeId,
                endpointKey: hint.endpointKey
            ) { [weak self] event in
                self?.notifyListeners(hint.eventName, data: event)
            }
            return try self.providerState()
        }
    }

    @objc func stopSyncGroupProvider(_ call: CAPPluginCall) {
        serviceMonitor.stop()
        FolioleCompanionSyncGroupJoinService.shared.clearForRestart()
        call.resolve(stoppedProviderState())
    }

    @objc func loadSyncGroupProviderState(_ call: CAPPluginCall) {
        do { call.resolve(try providerState()) }
        catch { call.resolve(stoppedProviderState()) }
    }

    @objc func acceptSyncGroupJoinRequest(_ call: CAPPluginCall) {
        runGroup(call, "Failed to accept Device") {
            let requestId = try self.requiredString(call, ["requestId": "request_id"], "requestId")
            return try FolioleCompanionSyncGroupJoinService.shared.withProvider { provider in
                let request = try provider.request(requestId)
                _ = try self.groupData.request("register_device", [
                    "group_id": provider.groupId,
                    "device": try request.registeredDevice(groupId: provider.groupId)
                ])
                _ = try provider.accept(requestId)
                self.publishProviderState()
                return try self.providerState()
            }
        }
    }

    @objc func rejectSyncGroupJoinRequest(_ call: CAPPluginCall) {
        runGroup(call, "Failed to reject Device") {
            let requestId = try self.requiredString(call, ["requestId": "request_id"], "requestId")
            return try FolioleCompanionSyncGroupJoinService.shared.withProvider {
                _ = try $0.reject(requestId)
                self.publishProviderState()
                return try self.providerState()
            }
        }
    }

    func providerState() throws -> [String: Any] {
        try FolioleCompanionSyncGroupJoinService.shared.state()
    }

    private func stoppedProviderState() -> [String: Any] {
        ["pending_requests": [], "port": NSNull(), "state": "stopped"]
    }

    func publishProviderState() {
        guard let state = try? providerState() else { return }
        DispatchQueue.main.async { self.notifyListeners("syncGroupProviderStateChanged", data: state) }
    }

    private func serviceHintContract() throws -> (eventName: String, endpointKey: String) {
        let provider = try FolioleCompanionContractStore().syncGroupProviderContract()
        guard let event = provider["serviceHintEvent"] as? String,
              let keys = provider["serviceHintKeys"] as? [String: String],
              let endpoint = keys["endpointUrl"] else {
            throw invalid("sync_group_service_hint_contract_invalid")
        }
        return (event, endpoint)
    }

    func runGroup(_ call: CAPPluginCall, _ message: String, operation: @escaping () throws -> [String: Any]) {
        DispatchQueue.global(qos: .userInitiated).async {
            do { call.resolve(try operation()) }
            catch { call.reject("\(message): \(error.localizedDescription)", nil, error) }
        }
    }
}

final class FolioleCompanionBonjourServiceMonitor: NSObject, NetServiceDelegate {
    private var browser: NWBrowser?
    private var services: [String: NetService] = [:]
    private var signatures: [String: String] = [:]
    private var groupId = ""
    private var localRuntimeId = ""
    private var endpointKey = "endpoint_url"
    private var onHint: (([String: Any]) -> Void)?

    func start(
        groupId: String, localRuntimeId: String, endpointKey: String,
        onHint: @escaping ([String: Any]) -> Void
    ) {
        DispatchQueue.main.async {
            if self.groupId != groupId { self.signatures.removeAll() }
            self.groupId = groupId
            self.localRuntimeId = localRuntimeId
            self.endpointKey = endpointKey
            self.onHint = onHint
            guard self.browser == nil else { return }
            let browser = NWBrowser(
                for: .bonjour(type: "_foliole-sync._tcp", domain: "local."), using: .tcp
            )
            self.browser = browser
            browser.browseResultsChangedHandler = { [weak self] results, _ in
                DispatchQueue.main.async { self?.resolve(results) }
            }
            browser.start(queue: .main)
        }
    }

    func stop() {
        DispatchQueue.main.async {
            self.browser?.cancel()
            self.browser = nil
            self.services.values.forEach { $0.stop() }
            self.services.removeAll()
            self.signatures.removeAll()
            self.onHint = nil
        }
    }

    private func resolve(_ results: Set<NWBrowser.Result>) {
        let live = Set(results.compactMap(Self.serviceKey))
        for key in Set(services.keys).subtracting(live) {
            services.removeValue(forKey: key)?.stop()
            signatures.removeValue(forKey: key)
        }
        for result in results {
            guard case let .service(name, type, domain, _) = result.endpoint else { continue }
            let key = Self.serviceKey(result) ?? ""
            services.removeValue(forKey: key)?.stop()
            let service = NetService(domain: domain, type: type, name: name)
            services[key] = service
            service.delegate = self
            service.resolve(withTimeout: 3)
        }
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        guard let entry = services.first(where: { $0.value === sender }),
              let data = sender.txtRecordData() else { return }
        let txt = Self.decodeTXT(data)
        guard txt["group_id"] == groupId,
              txt["runtime_instance_id"] != localRuntimeId,
              let endpoint = FolioleCompanionBonjourEndpoint.url(service: sender)
        else { return }
        let signature = "\(endpoint)|\(txt["facts_revision"] ?? "")"
        guard signatures[entry.key] != signature else { return }
        signatures[entry.key] = signature
        onHint?([endpointKey: endpoint])
    }

    private static func serviceKey(_ result: NWBrowser.Result) -> String? {
        guard case let .service(name, type, domain, _) = result.endpoint else { return nil }
        return "\(name)|\(type)|\(domain)"
    }

    private static func decodeTXT(_ data: Data) -> [String: String] {
        NetService.dictionary(fromTXTRecord: data).compactMapValues {
            String(data: $0, encoding: .utf8)
        }
    }
}
