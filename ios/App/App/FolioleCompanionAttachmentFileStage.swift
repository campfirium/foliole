import Foundation

enum FolioleCompanionAttachmentFileStage {
    struct Result {
        let createdURLs: [URL]
        let manifest: [[String: Any]]
    }

    static func stage(
        _ batch: FolioleCompanionAttachmentResourceSessions.Batch,
        directoryName: String
    ) throws -> Result {
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let root = support.appendingPathComponent(directoryName, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var created: [URL] = []
        var manifest: [[String: Any]] = []
        for item in batch.downloaded {
            let target = root.appendingPathComponent(item.contentHash)
            if FileManager.default.fileExists(atPath: target.path) {
                guard try FolioleCompanionAttachmentResourceDownloader.digestHex(target) == item.contentHash else {
                    throw invalid("Existing attachment resource hash mismatch.")
                }
                try? FileManager.default.removeItem(at: item.temporaryURL)
            } else {
                try FileManager.default.moveItem(at: item.temporaryURL, to: target)
                created.append(target)
            }
            let size = try target.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            manifest.append([
                "attachment_id": item.attachmentId,
                "content_hash": item.contentHash,
                "size_bytes": size,
                "storage_key": item.contentHash
            ])
        }
        return Result(createdURLs: created, manifest: manifest)
    }

    static func discard(_ urls: [URL]) {
        for url in urls { try? FileManager.default.removeItem(at: url) }
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionAttachmentFileStage", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
