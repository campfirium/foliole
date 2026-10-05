import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

enum FolioleCompanionFramedSyncResources {
    struct ResourceFile {
        let byteLength: UInt64
        let storageKey: String
        let url: URL
    }

    static func describe(_ inspected: [String: Any]) throws -> ([String: Any], [String: URL]) {
        guard let keys = inspected["resource_storage_keys"] as? [Any] else {
            throw invalid("framed_sync_resource_storage_keys_invalid")
        }
        let root = try attachmentRoot()
        var descriptions = [[String: Any]]()
        var files = [String: URL]()
        for raw in keys {
            guard let key = raw as? String, files[key] == nil else {
                throw invalid("framed_sync_resource_storage_keys_invalid")
            }
            let file = try requireVerifiedFile(root: root, storageKey: key)
            descriptions.append([
                "storage_key": file.storageKey,
                "byte_length": String(file.byteLength)
            ])
            files[key] = file.url
        }
        return (["resource_files": descriptions], files)
    }

    static func requireVerifiedFile(root: URL, storageKey: String) throws -> ResourceFile {
        guard FolioleCompanionCanonicalAttachmentKey.valid(storageKey) else {
            throw invalid("framed_sync_outbound_resource_key_invalid")
        }
        let url = root.appendingPathComponent(storageKey)
        let values = try url.resourceValues(forKeys: [
            .fileSizeKey, .isRegularFileKey, .isSymbolicLinkKey
        ])
        guard values.isRegularFile == true, values.isSymbolicLink != true,
              let size = values.fileSize, size >= 0,
              try digest(url) == Data(hex: String(storageKey.prefix(64))) else {
            throw invalid("framed_sync_outbound_resource_unavailable")
        }
        return .init(byteLength: UInt64(size), storageKey: storageKey, url: url)
    }

    static func attachmentRoot() throws -> URL {
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true
        )
        let contract = try FolioleCompanionContractStore().attachmentResourceContract()
        return support.appendingPathComponent(contract.directoryName, isDirectory: true)
    }

    private static func digest(_ url: URL) throws -> Data {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 64 * 1024), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return Data(hasher.finalize())
    }

    private static func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}

private extension Data {
    init(hex: String) {
        self.init(stride(from: 0, to: hex.count, by: 2).map { offset in
            let start = hex.index(hex.startIndex, offsetBy: offset)
            return UInt8(hex[start..<hex.index(start, offsetBy: 2)], radix: 16)!
        })
    }
}
