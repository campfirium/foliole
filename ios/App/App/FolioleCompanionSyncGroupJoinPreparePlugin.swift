import Capacitor
import Foundation

@objc(FolioleCompanionSyncGroupJoinPreparePlugin)
public final class FolioleCompanionSyncGroupJoinPreparePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FolioleCompanionSyncGroupJoinPreparePlugin"
    public let jsName = "FolioleSyncGroupJoinPrepare"
    public let pluginMethods: [CAPPluginMethod] = {
        var methods: [CAPPluginMethod] = [
            CAPPluginMethod(name: "receiveRequest", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "loadRequests", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "acceptRequest", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "collectAcceptance", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "rejectRequest", returnType: CAPPluginReturnPromise)
        ]
#if FOLIOLE_IOS_BRIDGE_ACCEPTANCE && targetEnvironment(simulator)
        methods += [
            CAPPluginMethod(name: "beginAcceptance", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "expireRequest", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "markRestartProbe", returnType: CAPPluginReturnPromise)
        ]
#endif
        return methods
    }()

    static let service = FolioleCompanionSyncGroupJoinService()

    @objc func receiveRequest(_ call: CAPPluginCall) {
        run(call) { provider in
            guard let request = call.getObject("request") else {
                throw FolioleCompanionSyncGroupJoinRequest.invalid("request_required")
            }
            return try provider.receive(request)
        }
    }

    @objc func loadRequests(_ call: CAPPluginCall) {
        run(call) { ["requests": $0.pending()] }
    }

    @objc func acceptRequest(_ call: CAPPluginCall) {
        run(call) { try $0.accept(try self.requestId(call)) }
    }

    @objc func collectAcceptance(_ call: CAPPluginCall) {
        run(call) { try $0.collect(try self.requestId(call)) }
    }

    @objc func rejectRequest(_ call: CAPPluginCall) {
        run(call) { ["rejected": try $0.reject(try self.requestId(call))] }
    }

#if FOLIOLE_IOS_BRIDGE_ACCEPTANCE && targetEnvironment(simulator)
    private static let restartMarker = "foliole.sync-group-join-acceptance.restart"

    @objc func beginAcceptance(_ call: CAPPluginCall) {
        runAcceptance(call) {
            guard let groupInfo = call.getObject("group_info") else {
                throw FolioleCompanionSyncGroupJoinRequest.invalid("group_info_required")
            }
            let restarted = UserDefaults.standard.bool(forKey: Self.restartMarker)
            let unavailableAfterRestart = restarted && self.providerIsUnavailable()
            try Self.service.install(groupInfo: groupInfo)
            let requests = try Self.service.withProvider { $0.pending() }
            if restarted { UserDefaults.standard.removeObject(forKey: Self.restartMarker) }
            return ["provider_restarted_clean": unavailableAfterRestart && requests.isEmpty,
                    "restart_probe": restarted]
        }
    }

    @objc func expireRequest(_ call: CAPPluginCall) {
        run(call) { provider in
            guard let request = call.getObject("request") else {
                throw FolioleCompanionSyncGroupJoinRequest.invalid("request_required")
            }
            let now = Date(timeIntervalSince1970: 1_788_000_000)
            _ = try provider.receive(request, now: now)
            return ["timeout_cleared": provider.pending(
                now: now.addingTimeInterval(FolioleCompanionSyncGroupJoinRequest.timeToLive + 1)
            ).isEmpty]
        }
    }

    @objc func markRestartProbe(_ call: CAPPluginCall) {
        run(call) { provider in
            let requestId = try self.requestId(call)
            guard provider.pending().contains(where: { $0["request_id"] as? String == requestId }) else {
                throw FolioleCompanionSyncGroupJoinRequest.invalid("restart_probe_request_missing")
            }
            UserDefaults.standard.set(true, forKey: Self.restartMarker)
            return ["pending_before_restart": true]
        }
    }

    private func providerIsUnavailable() -> Bool {
        do { _ = try Self.service.withProvider { $0.pending() }; return false }
        catch { return true }
    }

    private func runAcceptance(_ call: CAPPluginCall, operation: @escaping () throws -> [String: Any]) {
        DispatchQueue.global(qos: .userInitiated).async {
            do { call.resolve(try operation()) }
            catch { call.reject("Sync Group join acceptance failed: \(error.localizedDescription)", nil, error) }
        }
    }
#endif

    private func run(
        _ call: CAPPluginCall,
        operation: @escaping (FolioleCompanionSyncGroupJoinProvider) throws -> [String: Any]?
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let result = try Self.service.withProvider(operation)
                if let result { call.resolve(result) } else { call.resolve() }
            } catch {
                call.reject("Sync Group join prepare request failed: \(error.localizedDescription)", nil, error)
            }
        }
    }

    private func requestId(_ call: CAPPluginCall) throws -> String {
        guard let value = call.getString("request_id"), !value.isEmpty else {
            throw FolioleCompanionSyncGroupJoinRequest.invalid("request_id_required")
        }
        return value
    }
}
