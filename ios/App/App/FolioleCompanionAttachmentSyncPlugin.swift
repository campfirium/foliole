import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func loadMissingAttachmentResources(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionContractStore().attachmentResourceContract()
            let limit = call.getInt(try attachmentKey("limit", contract)) ?? contract.defaultLimit
            call.resolve(try attachmentStore(contract).loadMissing(limit: limit))
        } catch { call.reject("Failed to load missing companion attachment resources: \(error.localizedDescription)") }
    }

    @objc func loadMissingAttachmentResource(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionContractStore().attachmentResourceContract()
            call.resolve(try attachmentStore(contract).loadMissing(
                attachmentId: try attachmentString(call, "attachmentId", contract)
            ))
        } catch { call.reject("Failed to load missing companion attachment resource: \(error.localizedDescription)") }
    }

    @objc func downloadAttachmentResourceBatch(_ call: CAPPluginCall) {
        Task {
            do {
                let contract = try FolioleCompanionContractStore().attachmentResourceContract()
                let store = try attachmentStore(contract)
                let requests = try attachmentRequests(call, contract)
                let result = try await FolioleCompanionAttachmentResourceDownloader.download(
                    requests,
                    temporaryRoot: store.temporaryRoot,
                    hashPattern: contract.hashPattern
                )
                let token = await attachmentResourceSessions.create(
                    downloaded: result.downloaded,
                    failedIds: result.failedIds
                )
                call.resolve([
                    try attachmentValue("batchToken", contract.batchResponseKeys): token,
                    try attachmentValue("failedAttachmentIds", contract.batchResponseKeys): result.failedIds,
                    try attachmentValue("syncedAttachmentIds", contract.batchResponseKeys): result.downloaded.map(\.attachmentId)
                ])
            } catch { call.reject("Failed to download companion attachment resources: \(error.localizedDescription)") }
        }
    }

    @objc func commitAttachmentResourceBatch(_ call: CAPPluginCall) {
        Task {
            do {
                let contract = try FolioleCompanionContractStore().attachmentResourceContract()
                let token = try attachmentString(call, "batchToken", contract)
                if let ids = await attachmentResourceSessions.committed(token) {
                    call.resolve([try attachmentValue("syncedAttachmentIds", contract.batchResponseKeys): ids])
                    return
                }
                guard let batch = await attachmentResourceSessions.load(token) else {
                    throw attachmentError("Attachment resource batch token is unknown or expired.")
                }
                let ids = try attachmentStore(contract).commit(batch)
                await attachmentResourceSessions.markCommitted(token, ids: ids)
                call.resolve([try attachmentValue("syncedAttachmentIds", contract.batchResponseKeys): ids])
            } catch { call.reject("Failed to commit companion attachment resources: \(error.localizedDescription)") }
        }
    }

    @objc func resolveAttachmentResource(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionContractStore().attachmentResourceContract()
            call.resolve(try attachmentStore(contract).resolve(
                attachmentId: try attachmentString(call, "attachmentId", contract)
            ))
        } catch { call.reject("Failed to resolve companion attachment resource: \(error.localizedDescription)") }
    }
}

private func attachmentStore(_ contract: FolioleCompanionAttachmentResourceContract) throws -> FolioleCompanionAttachmentResourceStore {
    try FolioleCompanionAttachmentResourceStore(
        databaseURL: FolioleCompanionDatabaseLocation.mainDatabase(),
        contract: contract
    )
}

private func attachmentRequests(
    _ call: CAPPluginCall,
    _ contract: FolioleCompanionAttachmentResourceContract
) throws -> [FolioleCompanionAttachmentDownloadRequest] {
    guard let values = call.getArray(try attachmentKey("resources", contract)) else {
        throw attachmentError("resources is required")
    }
    return try values.map { value in
        guard let object = value as? JSObject else { throw attachmentError("Attachment resource is invalid.") }
        return FolioleCompanionAttachmentDownloadRequest(
            attachmentId: try attachmentString(object, "attachmentId", contract),
            contentHash: try attachmentString(object, "contentHash", contract),
            headers: try attachmentHeaders(object, contract),
            url: try attachmentString(object, "url", contract)
        )
    }
}

private func attachmentHeaders(
    _ object: JSObject,
    _ contract: FolioleCompanionAttachmentResourceContract
) throws -> [String: String] {
    guard let headers = object[try attachmentKey("headers", contract)] as? JSObject else { return [:] }
    return try headers.reduce(into: [:]) { result, entry in
        guard let value = entry.value as? String else { throw attachmentError("HTTP headers must be strings") }
        result[entry.key] = value
    }
}

private func attachmentString(
    _ object: JSObject,
    _ name: String,
    _ contract: FolioleCompanionAttachmentResourceContract
) throws -> String {
    let value = (object[try attachmentKey(name, contract)] as? String)?
        .trimmingCharacters(in: .whitespacesAndNewlines)
    guard let value, !value.isEmpty else { throw attachmentError("\(name) is required") }
    return value
}

private func attachmentString(
    _ container: any JSStringContainer,
    _ name: String,
    _ contract: FolioleCompanionAttachmentResourceContract
) throws -> String {
    let value = container.getString(try attachmentKey(name, contract))?.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let value, !value.isEmpty else { throw attachmentError("\(name) is required") }
    return value
}

private func attachmentKey(_ name: String, _ contract: FolioleCompanionAttachmentResourceContract) throws -> String {
    try attachmentValue(name, contract.requestKeys)
}

private func attachmentValue(_ name: String, _ values: [String: String]) throws -> String {
    guard let value = values[name] else { throw attachmentError("Missing attachment contract key \(name)") }
    return value
}

private func attachmentError(_ message: String) -> NSError {
    NSError(domain: "FolioleCompanionAttachmentSyncPlugin", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}
