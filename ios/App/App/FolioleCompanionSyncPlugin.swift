import Capacitor
import Foundation
import UIKit

@objc(FolioleCompanionSyncPlugin)
public class FolioleCompanionSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FolioleCompanionSyncPlugin"
    public let jsName = "FolioleCompanionSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "beginSyncRun", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "desktopHttpRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadAttachmentResourceBatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadContentBlobBatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishAttachmentResourceBatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishContentBlobBatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadDiscoveryCandidates", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadSyncGroupDeviceIdentity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startDiscoverySession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopDiscoverySession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadSyncGroupProviderState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadSyncParticipationState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolveAttachmentResource", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startSyncGroupProvider", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSyncGroupProvider", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acceptSyncGroupJoinRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rejectSyncGroupJoinRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolveSyncGroupDataRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSyncEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSyncPaused", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signCompanionSyncRequest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stageAttachmentResourceBatch", returnType: CAPPluginReturnPromise)
    ]

    private let discoveries = FolioleCompanionBonjourDiscoveryPool()
    let attachmentResourceSessions = FolioleCompanionAttachmentResourceSessions()
    private let contentBlobSessions = FolioleCompanionContentBlobSessions()
    lazy var groupData = FolioleCompanionSyncGroupDataBridge { [weak self] event in
        DispatchQueue.main.async { self?.notifyListeners("syncGroupDataRequest", data: event) }
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

    @objc func loadSyncGroupDeviceIdentity(_ call: CAPPluginCall) {
        do {
            guard let databasePath = call.getString("database_path"), !databasePath.isEmpty else {
                throw invalid("database_path_required")
            }
            call.resolve([
                "canonical_library_path": try FolioleCompanionDeviceAnchorStore.canonicalLibraryPath(databasePath),
                "device_anchor": try FolioleCompanionDeviceAnchorStore().loadOrCreate(),
                "device_name": UIDevice.current.name,
                "path_flavor": "posix",
                "platform": "ios-capacitor"
            ])
        } catch { call.reject("Failed to load Device identity: \(error.localizedDescription)") }
    }

    @objc func startDiscoverySession(_ call: CAPPluginCall) {
        do {
            let snapshot = discoveries.startSession(contract: try contract()) { [weak self] event in
                self?.notifyListeners("syncGroupDiscoveryChanged", data: event)
            }
            call.resolve(snapshot)
        } catch { call.reject("Sync Group discovery is unavailable: \(error.localizedDescription)") }
    }

    @objc func stopDiscoverySession(_ call: CAPPluginCall) {
        call.resolve(discoveries.stopSession())
    }

    @objc func resolveSyncGroupDataRequest(_ call: CAPPluginCall) {
        do { try groupData.resolve(call.jsObjectRepresentation); call.resolve() }
        catch { call.reject("Failed to resolve Sync Group data request: \(error.localizedDescription)") }
    }

    func required(_ value: [String: Any], _ key: String) throws -> String {
        guard let result = value[key] as? String, !result.isEmpty else { throw invalid("\(key)_required") }
        return result
    }

    func contract() throws -> FolioleCompanionNetworkContract {
        try FolioleCompanionContractStore().networkContract()
    }

    private func contentBlobContract() throws -> FolioleCompanionContentBlobContract {
        try FolioleCompanionContractStore().contentBlobContract()
    }


    func requiredString(_ call: CAPPluginCall, _ keys: [String: String], _ name: String) throws -> String {
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

    func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncPlugin", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
