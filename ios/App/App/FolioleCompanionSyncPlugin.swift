import Capacitor
import Foundation

@objc(FolioleCompanionSyncPlugin)
public class FolioleCompanionSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FolioleCompanionSyncPlugin"
    public let jsName = "FolioleCompanionSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "clearPairingCredentials", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeSyncGroupRouteGrant", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createSyncGroupJoinIntentKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "desktopHttpRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadAttachmentResourceBatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadContentBlobBatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discardSyncGroupJoinIntentKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishAttachmentResourceBatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishContentBlobBatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadDiscoveryCandidates", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadPairingState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadSyncGroupMemberRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadSyncParticipationState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolveAttachmentResource", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "savePairingCredentials", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSyncEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSyncPaused", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signCompanionSyncRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "migrateLegacyPairingToMemberRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "revokeSyncGroupMemberRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signSyncGroupMemberRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stageAttachmentResourceBatch", returnType: CAPPluginReturnPromise)
    ]

    private let discoveries = FolioleCompanionBonjourDiscoveryPool()
    let attachmentResourceSessions = FolioleCompanionAttachmentResourceSessions()
    private let contentBlobSessions = FolioleCompanionContentBlobSessions()

    @objc func loadPairingState(_ call: CAPPluginCall) {
        resolvePairing(call) { try $0.loadState() }
    }

    @objc func downloadContentBlobBatch(_ call: CAPPluginCall) {
        Task {
            do {
                let contract = try contentBlobContract()
                let body = try requiredString(call, contract.requestKeys, "body")
                let requested = try FolioleCompanionContentBlobBridgePayload.requestedHashes(body, contract: contract)
                let started = Date()
                let parts = try await FolioleCompanionDesktopHttpClient.requestContentBlobBatch(
                    url: try requiredString(call, contract.requestKeys, "url"),
                    headers: try stringHeaders(try requiredObject(call, contract.requestKeys, "headers")),
                    body: body,
                    contract: contract
                )
                let failed = requested.filter { hash in !parts.contains(where: { $0.hash == hash }) }
                let packURL = try FolioleCompanionContentBlobPack.create(parts: parts)
                let token = await contentBlobSessions.create(packURL: packURL, failedHashes: failed)
                call.resolve(try FolioleCompanionContentBlobBridgePayload.downloadResponse(
                    token, packURL: packURL, parts: parts, failed: failed, started: started, contract: contract
                ))
            } catch { call.reject("Failed to download companion content blobs: \(error.localizedDescription)") }
        }
    }

    @objc func finishContentBlobBatch(_ call: CAPPluginCall) {
        Task {
            do {
                let contract = try contentBlobContract()
                let token = try requiredString(call, contract.requestKeys, "batchToken")
                await contentBlobSessions.finish(token)
                call.resolve()
            } catch { call.reject("Failed to finish companion content blobs: \(error.localizedDescription)") }
        }
    }

    @objc func clearPairingCredentials(_ call: CAPPluginCall) {
        resolvePairing(call) { try $0.clear() }
    }

    @objc func savePairingCredentials(_ call: CAPPluginCall) {
        resolvePairing(call) { store in
            let contract = try self.contract()
            return try store.save(
                authorizationId: try self.requiredString(call, contract.credentialRequestKeys, "authorizationId"),
                credentialSecret: try self.requiredString(call, contract.credentialRequestKeys, "credentialSecret"),
                hostName: try self.requiredString(call, contract.credentialRequestKeys, "hostName"),
                hostPlatform: try self.requiredString(call, contract.credentialRequestKeys, "hostPlatform"),
                negotiatedProtocolVersion: try self.requiredInt(call, contract.credentialRequestKeys, "negotiatedProtocolVersion"),
                pairedAt: try self.requiredString(call, contract.credentialRequestKeys, "pairedAt"),
                remotePeerId: call.getString(try self.key("remotePeerId", contract.credentialRequestKeys)),
                remotePeerName: call.getString(try self.key("remotePeerName", contract.credentialRequestKeys)),
                remotePeerPlatform: call.getString(try self.key("remotePeerPlatform", contract.credentialRequestKeys)),
                remoteProtocol: try self.requiredObject(call, contract.credentialRequestKeys, "remoteProtocol")
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
            discoveries.start(contract: contract) { candidates in
                call.resolve([contract.discoveryResponseKeys["candidates"] ?? "invalid.candidates": candidates])
            }
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
