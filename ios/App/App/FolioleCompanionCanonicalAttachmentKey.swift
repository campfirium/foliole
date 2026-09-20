import Foundation

enum FolioleCompanionCanonicalAttachmentKey {
    private static let extensions = [
        "application/epub+zip": ".epub", "application/pdf": ".pdf", "image/gif": ".gif", "image/jpeg": ".jpg",
        "image/png": ".png", "image/webp": ".webp"
    ]

    static func storageKey(contentHash: String, mimeType: String) -> String? {
        guard contentHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              let suffix = extensions[mimeType.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()] else {
            return nil
        }
        return contentHash + suffix
    }

    static func valid(_ key: String) -> Bool {
        guard key.count > 64, String(key.prefix(64)).range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { return false }
        return extensions.values.contains(String(key.dropFirst(64)))
    }

    static func matches(contentHash: String, mimeType: String, storageKey: String) -> Bool {
        return storageKey == self.storageKey(contentHash: contentHash, mimeType: mimeType)
    }
}
