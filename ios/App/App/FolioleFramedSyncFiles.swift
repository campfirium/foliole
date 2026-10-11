import CryptoKit
import Darwin
import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncFiles {
    private let root: URL
    private let manager = FileManager.default

    init(root: URL) { self.root = root.resolvingSymlinksInPath() }

    init(libraryKey: String) throws {
        let directory = try FileManager.default.url(for: .applicationSupportDirectory,
            in: .userDomainMask, appropriateFor: nil, create: true)
        let hash = SHA256.hash(data: Data(libraryKey.utf8)).map { String(format: "%02x", $0) }.joined()
        root = directory.appendingPathComponent("SyncTransport").appendingPathComponent(hash).resolvingSymlinksInPath()
    }

    func read(_ key: String) throws -> Data? {
        let url = try resolve(key)
        return manager.fileExists(atPath: url.path) ? try Data(contentsOf: url) : nil
    }

    func write(_ key: String, data: Data) throws {
        let url = try resolve(key)
        let parent = url.deletingLastPathComponent()
        if key.hasPrefix("requests/") {
            try manager.createDirectory(at: parent, withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700])
            var excluded = URLResourceValues()
            excluded.isExcludedFromBackup = true
            var syncRoot = root
            try syncRoot.setResourceValues(excluded)
            try data.write(to: url)
            return
        }
        try ensureDirectory(parent)
        var excluded = URLResourceValues()
        excluded.isExcludedFromBackup = true
        var syncRoot = root
        try syncRoot.setResourceValues(excluded)
        let temporary = parent.appendingPathComponent(".\(UUID().uuidString).tmp")
        defer { try? manager.removeItem(at: temporary) }
        try data.write(to: temporary, options: .withoutOverwriting)
        let handle = try FileHandle(forWritingTo: temporary)
        do { try handle.synchronize(); try handle.close() }
        catch { try? handle.close(); throw error }
        guard rename(temporary.path, url.path) == 0 else { throw invalid("framed_sync_file_publish_failed") }
        try syncDirectory(parent)
    }

    func list(_ key: String) throws -> [String] {
        let url = try resolve(key)
        if !manager.fileExists(atPath: url.path) { return [] }
        return try manager.contentsOfDirectory(atPath: url.path).filter { !$0.hasPrefix(".") }.sorted()
    }

    func remove(_ key: String) throws {
        let url = try resolve(key)
        if !manager.fileExists(atPath: url.path) { return }
        try manager.removeItem(at: url)
        if key != "requests" && !key.hasPrefix("requests/") { try syncDirectory(url.deletingLastPathComponent()) }
    }

    private func resolve(_ key: String) throws -> URL {
        let parts = key.split(separator: "/", omittingEmptySubsequences: false)
        guard !parts.isEmpty, parts.allSatisfy({
            !$0.contains("..") && $0.range(of: "^[a-z0-9][a-z0-9_.-]*$", options: .regularExpression) != nil
        }) else { throw invalid("framed_sync_file_key_invalid") }
        let url = root.appendingPathComponent(key)
        guard url.resolvingSymlinksInPath().path == url.standardizedFileURL.path else {
            throw invalid("framed_sync_file_path_invalid")
        }
        return url
    }

    private func ensureDirectory(_ url: URL) throws {
        var directory: ObjCBool = false
        if manager.fileExists(atPath: url.path, isDirectory: &directory) {
            guard directory.boolValue else { throw invalid("framed_sync_directory_invalid") }
            return
        }
        let parent = url.deletingLastPathComponent()
        guard parent.path != url.path else { throw invalid("framed_sync_directory_invalid") }
        try ensureDirectory(parent)
        do {
            try manager.createDirectory(at: url, withIntermediateDirectories: false,
                attributes: [.posixPermissions: 0o700])
        } catch {
            guard manager.fileExists(atPath: url.path, isDirectory: &directory), directory.boolValue else { throw error }
        }
        try syncDirectory(parent)
    }

    func syncDirectory(_ url: URL) throws {
        let descriptor = open(url.path, O_RDONLY)
        guard descriptor >= 0 else { throw invalid("framed_sync_directory_open_failed") }
        defer { close(descriptor) }
        guard fsync(descriptor) == 0 else { throw invalid("framed_sync_directory_sync_failed") }
    }

    private func invalid(_ code: String) -> Error { FolioleFramedSyncValidationError(code) }
}
