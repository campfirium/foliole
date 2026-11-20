import Foundation

enum FolioleAttachmentResourceReadiness {
    /// A stored attachment is ready when the canonical path holds a regular, unlinked file.
    /// Presence-only requests stop there; other requests also require the bytes to match the content hash.
    static func isReady(
        _ fileURL: URL,
        contentHash: String,
        presenceOnly: Bool,
        digestHex: (URL) throws -> String = FolioleCompanionAttachmentResourceDownloader.digestHex
    ) -> Bool {
        let values = try? fileURL.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values?.isRegularFile == true, values?.isSymbolicLink != true else { return false }
        return presenceOnly || (try? digestHex(fileURL)) == contentHash
    }
}
