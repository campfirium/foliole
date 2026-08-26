import Capacitor
import Foundation

@objc(FolioleCompanionSyncGroupJoinPreparePlugin)
public final class FolioleCompanionSyncGroupJoinPreparePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FolioleCompanionSyncGroupJoinPreparePlugin"
    public let jsName = "FolioleSyncGroupJoinPrepare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "receiveRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadRequests", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acceptRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "collectAcceptance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rejectRequest", returnType: CAPPluginReturnPromise)
    ]

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
