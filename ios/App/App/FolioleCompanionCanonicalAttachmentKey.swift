import Foundation

enum FolioleCompanionCanonicalAttachmentKey {
    private static let extensions = [
        "application/pdf": ".pdf", "image/gif": ".gif", "image/jpeg": ".jpg",
        "image/png": ".png", "image/webp": ".webp"
    ]

    static func matches(contentHash: String, mimeType: String, storageKey: String) -> Bool {
        guard contentHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              let suffix = extensions[mimeType.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()] else {
            return false
        }
        return storageKey == contentHash + suffix
    }
}
