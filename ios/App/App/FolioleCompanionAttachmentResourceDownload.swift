import CryptoKit
import Foundation

enum FolioleCompanionAttachmentResourceDownloader {
    static func digestHex(_ url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var digest = SHA256()
        while let chunk = try handle.read(upToCount: 1_048_576), !chunk.isEmpty { digest.update(data: chunk) }
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }

    static func resourceFailure(_ error: Error) -> String {
        let message = error.localizedDescription
        let nsError = error as NSError
        if (nsError.domain == NSCocoaErrorDomain && nsError.code == CocoaError.fileWriteOutOfSpace.rawValue)
            || (nsError.domain == NSPOSIXErrorDomain && nsError.code == POSIXError.ENOSPC.rawValue)
            || message.contains("disk_full") { return "disk_full" }
        if ["missing_file", "authentication_failed", "protocol_error"].contains(message) { return message }
        if message.contains("hash mismatch") { return "checksum_mismatch" }
        if message.contains("aead") || message.contains("signature") { return "authentication_failed" }
        if (error as NSError).domain == NSURLErrorDomain { return "network_error" }
        return "protocol_error"
    }
}
