import Capacitor
import UIKit

private enum FolioleCompanionSyncParticipation {
    private static let enabledKey = "foliole.syncGroup.syncEnabled"
    private static let pausedKey = "foliole.syncGroup.syncPaused"

    static func load() -> JSObject {
        let defaults = UserDefaults.standard
        let enabled = defaults.object(forKey: enabledKey) as? Bool ?? true
        let paused = defaults.object(forKey: pausedKey) as? Bool ?? false
        let lifecycleActive = UIApplication.shared.applicationState == .active
        return snapshot(enabled: enabled, paused: paused, lifecycleActive: lifecycleActive)
    }

    static func setEnabled(_ enabled: Bool) -> JSObject {
        UserDefaults.standard.set(enabled, forKey: enabledKey)
        return load()
    }

    static func setPaused(_ paused: Bool) -> JSObject {
        UserDefaults.standard.set(paused, forKey: pausedKey)
        return load()
    }

    private static func snapshot(enabled: Bool, paused: Bool, lifecycleActive: Bool) -> JSObject {
        [
            "lifecycle_active": lifecycleActive,
            "sync_enabled": enabled,
            "sync_paused": paused,
            "participating": lifecycleActive && enabled && !paused
        ]
    }
}

extension FolioleCompanionSyncPlugin {
    @objc func loadSyncParticipationState(_ call: CAPPluginCall) {
        call.resolve(FolioleCompanionSyncParticipation.load())
    }

    @objc func setSyncEnabled(_ call: CAPPluginCall) {
        guard let value = call.getBool("sync_enabled") else {
            call.reject("sync_enabled is required")
            return
        }
        call.resolve(FolioleCompanionSyncParticipation.setEnabled(value))
    }

    @objc func setSyncPaused(_ call: CAPPluginCall) {
        guard let value = call.getBool("sync_paused") else {
            call.reject("sync_paused is required")
            return
        }
        call.resolve(FolioleCompanionSyncParticipation.setPaused(value))
    }
}

extension FolioleCompanionSyncPlugin {
    @objc func loadSyncGroupMemberRoute(_ call: CAPPluginCall) {
        resolveInactiveRoute(call) { store, contract in
            let routeId = try self.routeString(call, contract, "routeId")
            guard let route = try store.load(routeId) else { return ["route": NSNull()] }
            return ["route": try store.state(route)]
        }
    }

    @objc func migrateLegacyPairingToMemberRoute(_ call: CAPPluginCall) {
        resolveInactiveRoute(call) { store, contract in
            let pairingContract = try FolioleCompanionContractStore().pairingContract()
            let credential = try FolioleCompanionPairingStore(contract: pairingContract).migrationCredential()
            let authorizationId = try self.routeString(call, contract, "authorizationId")
            guard credential.authorizationId == authorizationId else { throw self.routeInvalid("authorization mismatch") }
            let route = FolioleCompanionSyncGroupMemberRoute(
                authorizationEpoch: try self.routeInt(call, contract, "authorizationEpoch"),
                authorizationId: authorizationId,
                endpointHint: call.getString(try self.routeKey("endpointHint", contract.requestKeys)),
                groupId: try self.routeString(call, contract, "groupId"),
                localMemberId: try self.routeString(call, contract, "localMemberId"),
                peerMemberId: try self.routeString(call, contract, "peerMemberId"),
                protocolVersion: try self.routeInt(call, contract, "protocolVersion"),
                routeId: try self.routeString(call, contract, "routeId"), secret: credential.secret)
            try store.save(route)
            return ["route": try store.state(route), "status": "migrated"]
        }
    }

    @objc func revokeSyncGroupMemberRoute(_ call: CAPPluginCall) {
        resolveInactiveRoute(call) { store, contract in
            ["revoked": try store.revoke(try self.routeString(call, contract, "routeId"))]
        }
    }

    @objc func signSyncGroupMemberRequest(_ call: CAPPluginCall) {
        resolveInactiveRoute(call) { store, contract in
            ["headers": try store.sign(
                routeId: try self.routeString(call, contract, "routeId"),
                method: try self.routeString(call, contract, "method"),
                path: try self.routeString(call, contract, "pathWithQuery"),
                timestamp: try self.routeString(call, contract, "timestamp"),
                nonce: try self.routeString(call, contract, "nonce"),
                bodyHash: try self.routeString(call, contract, "bodyHash"))]
        }
    }

    private func resolveInactiveRoute(
        _ call: CAPPluginCall,
        operation: (FolioleCompanionSyncGroupMemberRouteStore,
                    FolioleCompanionSyncGroupAuthorizationContract) throws -> [String: Any]
    ) {
        do {
            let contract = try FolioleCompanionContractStore().syncGroupAuthorizationContract()
            guard try routeString(call, contract, "prepareToken") == contract.prepareToken else {
                throw routeInvalid("prepare-only authorization")
            }
            call.resolve(try operation(FolioleCompanionSyncGroupMemberRouteStore(contract: contract), contract))
        } catch { call.reject("Inactive Sync Group authorization failed: \(error.localizedDescription)") }
    }

    private func routeString(
        _ call: CAPPluginCall, _ contract: FolioleCompanionSyncGroupAuthorizationContract, _ name: String
    ) throws -> String {
        let value = call.getString(try routeKey(name, contract.requestKeys))?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value, !value.isEmpty else { throw routeInvalid("\(name) is required") }
        return value
    }

    private func routeInt(
        _ call: CAPPluginCall, _ contract: FolioleCompanionSyncGroupAuthorizationContract, _ name: String
    ) throws -> Int {
        guard let value = call.getInt(try routeKey(name, contract.requestKeys)) else {
            throw routeInvalid("\(name) is required")
        }
        return value
    }

    private func routeKey(_ name: String, _ keys: [String: String]) throws -> String {
        guard let value = keys[name] else { throw routeInvalid("Missing contract key \(name)") }
        return value
    }

    private func routeInvalid(_ message: String) -> NSError {
        NSError(domain: "FolioleSyncGroupAuthorization", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}
