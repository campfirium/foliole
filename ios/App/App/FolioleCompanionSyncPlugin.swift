import Capacitor
import Foundation

@objc(FolioleCompanionSyncPlugin)
public class FolioleCompanionSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FolioleCompanionSyncPlugin"
    public let jsName = "FolioleCompanionSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "clearPairingCredentials", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "commitContentBlobBatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "desktopHttpRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadContentBlobBatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadDiscoveryCandidates", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadMissingContentBlobHashes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadPairingState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "savePairingCredentials", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "savePrimaryDeviceId", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signCompanionSyncRequest", returnType: CAPPluginReturnPromise)
    ]

    private var discovery: FolioleCompanionBonjourDiscovery?
    private let contentBlobSessions = FolioleCompanionContentBlobSessions()

    @objc func loadPairingState(_ call: CAPPluginCall) {
        resolvePairing(call) { try $0.loadState() }
    }

    @objc func loadMissingContentBlobHashes(_ call: CAPPluginCall) {
        do {
            let contract = try contentBlobContract()
            let limit = call.getInt(try key("limit", contract.requestKeys)) ?? contract.defaultLimit
            let database = try FolioleCompanionContentBlobDatabase(
                url: FolioleCompanionDatabaseLocation.mainDatabase(),
                contract: contract
            )
            call.resolve(try database.loadMissing(limit: limit))
        } catch { call.reject("Failed to load missing companion content blobs: \(error.localizedDescription)") }
    }

    @objc func downloadContentBlobBatch(_ call: CAPPluginCall) {
        Task {
            do {
                let contract = try contentBlobContract()
                let body = try requiredString(call, contract.requestKeys, "body")
                let requested = try FolioleCompanionContentBlobBridgePayload.requestedHashes(body, contract: contract)
                let started = Date()
                let parts = (try? await FolioleCompanionDesktopHttpClient.requestContentBlobBatch(
                    url: try requiredString(call, contract.requestKeys, "url"),
                    headers: try stringHeaders(call.getObject(try key("headers", contract.requestKeys)) ?? [:]),
                    body: body,
                    contract: contract
                )) ?? []
                let failed = requested.filter { hash in !parts.contains(where: { $0.hash == hash }) }
                let token = await contentBlobSessions.create(parts: parts, failedHashes: failed)
                call.resolve(try FolioleCompanionContentBlobBridgePayload.downloadResponse(
                    token, parts: parts, failed: failed, started: started, contract: contract
                ))
            } catch { call.reject("Failed to download companion content blobs: \(error.localizedDescription)") }
        }
    }

    @objc func commitContentBlobBatch(_ call: CAPPluginCall) {
        Task {
            do {
                let contract = try contentBlobContract()
                let token = try requiredString(call, contract.requestKeys, "batchToken")
                if let committed = await contentBlobSessions.committed(token) {
                    call.resolve(try FolioleCompanionContentBlobBridgePayload.commitResponse(
                        committed, elapsedMs: 0, contract: contract
                    ))
                    return
                }
                guard let batch = await contentBlobSessions.load(token) else { throw invalid("Content blob batch token is unknown or expired.") }
                let started = Date()
                let database = try FolioleCompanionContentBlobDatabase(
                    url: FolioleCompanionDatabaseLocation.mainDatabase(),
                    contract: contract
                )
                let synced = try database.commit(parts: batch.parts, failedHashes: batch.failedHashes)
                await contentBlobSessions.markCommitted(token, hashes: synced)
                call.resolve(try FolioleCompanionContentBlobBridgePayload.commitResponse(
                    synced,
                    elapsedMs: FolioleCompanionContentBlobBridgePayload.elapsedMs(since: started),
                    contract: contract
                ))
            } catch { call.reject("Failed to commit companion content blobs: \(error.localizedDescription)") }
        }
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

    private func contentBlobContract() throws -> FolioleCompanionContentBlobContract {
        try FolioleCompanionContractStore().contentBlobContract()
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
