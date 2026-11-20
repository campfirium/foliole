import Foundation

enum FolioleAttachmentResourceReadiness {
    /// A stored attachment is ready when the canonical path holds a regular, unlinked file.
    /// Presence-only requests and image display of an image stop there, matching Android;
    /// other requests also require the bytes to match the content hash.
    static func isReady(
        _ fileURL: URL,
        contentHash: String,
        presenceOnly: Bool,
        imageDisplay: Bool = false,
        mimeType: String = "",
        digestHex: (URL) throws -> String = FolioleCompanionAttachmentResourceDownloader.digestHex
    ) -> Bool {
        let values = try? fileURL.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values?.isRegularFile == true, values?.isSymbolicLink != true else { return false }
        if presenceOnly || (imageDisplay && mimeType.hasPrefix("image/")) { return true }
        return (try? digestHex(fileURL)) == contentHash
    }
}
