import Capacitor
import Foundation

@objc(FolioleCompanionSyncPlugin)
public class FolioleCompanionSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FolioleCompanionSyncPlugin"
    public let jsName = "FolioleCompanionSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "clearPairingCredentials", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "desktopHttpRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadDiscoveryCandidates", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadPairingState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "savePairingCredentials", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "savePrimaryDeviceId", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signCompanionSyncRequest", returnType: CAPPluginReturnPromise)
    ]

    private var discovery: FolioleCompanionBonjourDiscovery?

    @objc func loadPairingState(_ call: CAPPluginCall) {
        resolvePairing(call) { try $0.loadState() }
    }

    @objc func clearPairingCredentials(_ call: CAPPluginCall) {
        resolvePairing(call) { try $0.clear() }
    }

    @objc func savePairingCredentials(_ call: CAPPluginCall) {
        resolvePairing(call) { store in
            let contract = try self.contract()
            return try store.save(
                deviceId: try self.requiredString(call, contract.credentialRequestKeys, "deviceId"),
                deviceKind: try self.requiredString(call, contract.credentialRequestKeys, "deviceKind"),
                deviceName: try self.requiredString(call, contract.credentialRequestKeys, "deviceName"),
                deviceSecret: try self.requiredString(call, contract.credentialRequestKeys, "deviceSecret"),
                negotiatedProtocolVersion: try self.requiredInt(call, contract.credentialRequestKeys, "negotiatedProtocolVersion"),
                pairedAt: try self.requiredString(call, contract.credentialRequestKeys, "pairedAt"),
                primaryDeviceId: try self.requiredString(call, contract.credentialRequestKeys, "primaryDeviceId"),
                remoteProtocol: try self.requiredObject(call, contract.credentialRequestKeys, "remoteProtocol")
            )
        }
    }

    @objc func savePrimaryDeviceId(_ call: CAPPluginCall) {
        resolvePairing(call) { store in
            let contract = try self.contract()
            return try store.savePrimaryDeviceId(
                try self.requiredString(call, contract.credentialRequestKeys, "primaryDeviceId")
            )
        }
    }

    @objc func signCompanionSyncRequest(_ call: CAPPluginCall) {
        resolvePairing(call) { store in
            let contract = try self.contract()
            return try store.sign(
                method: try self.requiredString(call, contract.signatureRequestKeys, "method"),
                path: try self.requiredString(call, contract.signatureRequestKeys, "pathWithQuery"),
                timestamp: try self.requiredString(call, contract.signatureRequestKeys, "timestamp"),
                nonce: try self.requiredString(call, contract.signatureRequestKeys, "nonce"),
                bodyHash: try self.requiredString(call, contract.signatureRequestKeys, "bodyHash")
            )
        }
    }

    @objc func desktopHttpRequest(_ call: CAPPluginCall) {
        do {
            let contract = try contract()
            let url = try requiredString(call, contract.networkRequestKeys, "url")
            let method = try requiredString(call, contract.networkRequestKeys, "method")
            let headers = try stringHeaders(call.getObject(try key("headers", contract.networkRequestKeys)) ?? [:])
            let body = call.getString(try key("body", contract.networkRequestKeys))
            Task {
                do {
                    call.resolve(try await FolioleCompanionDesktopHttpClient.request(
                        url: url, method: method, headers: headers, body: body, contract: contract
                    ))
                } catch { call.reject("Desktop HTTP request failed: \(error.localizedDescription)") }
            }
        } catch { call.reject("Desktop HTTP request failed: \(error.localizedDescription)") }
    }

    @objc func loadDiscoveryCandidates(_ call: CAPPluginCall) {
        do {
            let contract = try contract()
            discovery = FolioleCompanionBonjourDiscovery(contract: contract) { [weak self] candidates in
                call.resolve([contract.discoveryResponseKeys["candidates"] ?? "invalid.candidates": candidates])
                self?.discovery = nil
            }
            discovery?.start()
        } catch { call.reject("Failed to load companion discovery candidates: \(error.localizedDescription)") }
    }

    private func resolvePairing(
        _ call: CAPPluginCall,
        operation: (FolioleCompanionPairingStore) throws -> [String: Any]
    ) {
        do {
            let contract = try contract()
            call.resolve(try operation(FolioleCompanionPairingStore(contract: contract)))
        } catch { call.reject("Companion pairing operation failed: \(error.localizedDescription)") }
    }

    private func contract() throws -> FolioleCompanionPairingContract {
        try FolioleCompanionContractStore().pairingContract()
    }

    private func requiredString(_ call: CAPPluginCall, _ keys: [String: String], _ name: String) throws -> String {
        let value = call.getString(try key(name, keys))?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value, !value.isEmpty else { throw invalid("\(name) is required") }
        return value
    }

    private func requiredInt(_ call: CAPPluginCall, _ keys: [String: String], _ name: String) throws -> Int {
        guard let value = call.getInt(try key(name, keys)) else { throw invalid("\(name) is required") }
        return value
    }

    private func requiredObject(_ call: CAPPluginCall, _ keys: [String: String], _ name: String) throws -> JSObject {
        guard let value = call.getObject(try key(name, keys)) else { throw invalid("\(name) is required") }
        return value
    }

    private func stringHeaders(_ value: JSObject) throws -> [String: String] {
        try value.reduce(into: [:]) { result, entry in
            guard let string = entry.value as? String else { throw invalid("HTTP headers must be strings") }
            result[entry.key] = string
        }
    }

    private func key(_ name: String, _ values: [String: String]) throws -> String {
        guard let value = values[name] else { throw invalid("Missing contract key \(name)") }
        return value
    }

    private func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncPlugin", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
