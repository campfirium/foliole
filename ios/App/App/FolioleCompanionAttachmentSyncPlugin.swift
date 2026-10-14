import Capacitor
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func resolveAttachmentResource(_ call: CAPPluginCall) {
        do {
            let contract = try FolioleCompanionContractStore().attachmentResourceContract()
            let storageKey = call.getString("storage_key")?.trimmingCharacters(in: .whitespacesAndNewlines)
            let mimeType = call.getString("mime_type")
            let contentHash = call.getString("content_hash")?.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let storageKey, let contentHash, let mimeType,
                  FolioleCompanionCanonicalAttachmentKey.matches(
                    contentHash: contentHash, mimeType: mimeType, storageKey: storageKey
                  ) else {
                call.resolve(["status": "missing_file", "mime_type": mimeType ?? NSNull(), "resource_url": NSNull()])
                return
            }
            let fileURL = try attachmentRoot(contract).appendingPathComponent(storageKey)
            if !FileManager.default.fileExists(atPath: fileURL.path) {
                try FolioleAttachmentMaintenanceFiles.move(storageKey, toTrash: false)
            }
            let values = try? fileURL.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            let exists = values?.isRegularFile == true && values?.isSymbolicLink != true &&
                (try? FolioleCompanionAttachmentResourceDownloader.digestHex(fileURL)) == contentHash
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
