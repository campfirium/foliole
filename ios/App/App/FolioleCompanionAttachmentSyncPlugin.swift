import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func stageAttachmentResourceBatch(_ call: CAPPluginCall) {
        Task {
            do {
                let contract = try FolioleCompanionContractStore().attachmentResourceContract()
                let token = try attachmentString(call, "batchToken", contract)
                if let manifest = await attachmentResourceSessions.staged(token),
                   let batch = await attachmentResourceSessions.load(token) {
                    call.resolve([
                        try attachmentValue("failedAttachmentIds", contract.batchResponseKeys): batch.failedIds,
                        try attachmentValue("manifest", contract.batchResponseKeys): manifest
                    ])
                    return
                }
                guard let batch = await attachmentResourceSessions.load(token) else {
                    throw attachmentError("Attachment resource batch token is unknown or expired.")
                }
                let result = try FolioleCompanionAttachmentFileStage.stage(batch, directoryName: contract.directoryName)
                await attachmentResourceSessions.markStaged(token, result: result)
                call.resolve([
                    try attachmentValue("failedAttachmentIds", contract.batchResponseKeys): batch.failedIds,
                    try attachmentValue("manifest", contract.batchResponseKeys): result.manifest
                ])
            } catch { call.reject("Failed to stage companion attachment resources: \(error.localizedDescription)") }
        }
    }

    @objc func finishAttachmentResourceBatch(_ call: CAPPluginCall) {
        Task {
            do {
                let contract = try FolioleCompanionContractStore().attachmentResourceContract()
                let token = try attachmentString(call, "batchToken", contract)
                let committedKey = try attachmentKey("committed", contract)
                await attachmentResourceSessions.finish(token, committed: call.getBool(committedKey) ?? false)
                call.resolve()
            } catch { call.reject("Failed to finish companion attachment resources: \(error.localizedDescription)") }
        }
    }

    @objc func downloadAttachmentResourceBatch(_ call: CAPPluginCall) {
        Task {
            do {
                let contract = try FolioleCompanionContractStore().attachmentResourceContract()
                let requests = try attachmentRequests(call, contract)
                let result = try await FolioleCompanionAttachmentResourceDownloader.download(
                    requests,
                    temporaryRoot: try attachmentTemporaryRoot(contract),
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

    @objc func resolveAttachmentResource(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionContractStore().attachmentResourceContract()
            let storageKey = call.getString("storage_key")?.trimmingCharacters(in: .whitespacesAndNewlines)
            let mimeType = call.getString("mime_type")
            guard let storageKey, !storageKey.isEmpty else {
                call.resolve(["status": "missing_file", "mime_type": mimeType ?? NSNull(), "resource_url": NSNull()])
                return
            }
            let fileURL = try attachmentRoot(contract).appendingPathComponent(storageKey)
            let exists = FileManager.default.fileExists(atPath: fileURL.path)
            call.resolve([
                "status": exists ? "ready" : "missing_file",
                "mime_type": mimeType ?? NSNull(),
                "resource_url": exists ? fileURL.absoluteString : NSNull()
            ])
        } catch { call.reject("Failed to resolve companion attachment resource: \(error.localizedDescription)") }
    }
}

private func attachmentRoot(_ contract: FolioleCompanionAttachmentResourceContract) throws -> URL {
    let support = try FileManager.default.url(
        for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
    )
    let root = support.appendingPathComponent(contract.directoryName, isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    return root
}

private func attachmentTemporaryRoot(_ contract: FolioleCompanionAttachmentResourceContract) throws -> URL {
    try attachmentRoot(contract).appendingPathComponent(".tmp", isDirectory: true)
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
    guard let headers = object[try attachmentKey("headers", contract)] as? JSObject else {
        throw attachmentError("headers must be an object")
    }
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
