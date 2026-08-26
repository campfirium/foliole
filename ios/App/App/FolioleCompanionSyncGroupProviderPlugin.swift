import Capacitor
import Foundation

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
                "runtime_instance_id": UUID().uuidString.lowercased()
            ]
            try FolioleCompanionSyncGroupJoinService.shared.install(
                groupInfo: info, discovery: discovery, dataBridge: self.groupData,
                stateChanged: { [weak self] in self?.publishProviderState() }
            )
            return try self.providerState()
        }
    }

    @objc func stopSyncGroupProvider(_ call: CAPPluginCall) {
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

    func runGroup(_ call: CAPPluginCall, _ message: String, operation: @escaping () throws -> [String: Any]) {
        DispatchQueue.global(qos: .userInitiated).async {
            do { call.resolve(try operation()) }
            catch { call.reject("\(message): \(error.localizedDescription)", nil, error) }
        }
    }
}
