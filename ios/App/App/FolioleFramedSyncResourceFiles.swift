import CryptoKit
import Foundation
import FolioleFramedSyncRuntime
import ZIPFoundation

enum FolioleFramedSyncResourceFiles {
    static func partial(
        root: URL, transferID: Data, attemptID: Data, hash: Data
    ) -> URL {
        root.appendingPathComponent(
            ".framed-sync-\(transferID.hex)-\(attemptID.hex)-\(hash.hex).partial"
        )
    }

    static func verify(
        _ url: URL, expectedHash: Data, expectedLength: UInt64, role: Int
    ) throws -> String? {
        let values = try? url.resourceValues(forKeys: [
            .fileSizeKey, .isRegularFileKey, .isSymbolicLinkKey
        ])
        guard values?.isRegularFile == true, values?.isSymbolicLink != true,
              values?.fileSize.map(UInt64.init) == expectedLength,
              try digest(url) == expectedHash,
              let suffix = try fileExtension(url, role: role) else { return nil }
        return expectedHash.hex + suffix
    }

    private static func fileExtension(_ url: URL, role: Int) throws -> String? {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let prefix = try handle.read(upToCount: 12) ?? Data()
        switch role {
        case Int(Foliole_Sync_V22_BlobRole.image.rawValue): return imageExtension(prefix)
        case Int(Foliole_Sync_V22_BlobRole.pdf.rawValue):
            return prefix.starts(with: Data("%PDF-".utf8)) ? ".pdf" : nil
        case Int(Foliole_Sync_V22_BlobRole.attachment.rawValue):
            return try isEPUB(url) ? ".epub" : nil
        default: return nil
        }
    }

    private static func imageExtension(_ data: Data) -> String? {
        if data.starts(with: Data([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
            return ".png"
        }
        if data.starts(with: Data([0xff, 0xd8, 0xff])) { return ".jpg" }
        if data.starts(with: Data("GIF87a".utf8)) || data.starts(with: Data("GIF89a".utf8)) {
            return ".gif"
        }
        if data.count >= 12, data.starts(with: Data("RIFF".utf8)),
           data[8..<12] == Data("WEBP".utf8) { return ".webp" }
        return nil
    }

    private static func isEPUB(_ url: URL) throws -> Bool {
        let archive = try Archive(url: url, accessMode: .read)
        guard let entry = archive["mimetype"], entry.uncompressedSize <= 64 else { return false }
        var value = Data()
        _ = try archive.extract(entry) { value.append($0) }
        return value == Data("application/epub+zip".utf8)
    }

    private static func digest(_ url: URL) throws -> Data {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let value = try handle.read(upToCount: 64 * 1024), !value.isEmpty {
            hasher.update(data: value)
        }
        return Data(hasher.finalize())
    }
}
