import Capacitor
import CryptoKit
import Darwin
import Foundation
import FolioleFramedSyncRuntime

final class FolioleAttachmentBlockFiles {
    private static let mutex = NSRecursiveLock()
    private static var owners = [ObjectIdentifier: FolioleAttachmentBlockFiles]()
    private let root: URL
    private var descriptor: Int32 = -1
    private var sources = [String: FileHandle]()

    private init() throws {
        root = try FolioleAttachmentMaintenanceFiles.directory(false).resolvingSymlinksInPath()
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }
    static func access(_ owner: FolioleFramedSyncPayloadBudget, _ call: CAPPluginCall) throws -> JSObject {
        mutex.lock(); defer { mutex.unlock() }
        try owner.requireActive()
        let id = ObjectIdentifier(owner)
        let files: FolioleAttachmentBlockFiles
        if let existing = owners[id] { files = existing }
        else {
            files = try FolioleAttachmentBlockFiles(); owners[id] = files
            owner.onAttachmentClose { close(owner) }
        }
        try owner.requireActive()
        return try files.execute(call)
    }
    static func close(_ owner: FolioleFramedSyncPayloadBudget) {
        mutex.lock(); defer { mutex.unlock() }
        guard let files = owners.removeValue(forKey: ObjectIdentifier(owner)) else { return }
        for handle in files.sources.values { try? handle.close() }
        files.sources.removeAll()
        if files.descriptor >= 0 { Darwin.close(files.descriptor); files.descriptor = -1 }
    }
    private func acquire() throws {
        if descriptor >= 0 { return }
        let candidate = Darwin.open(root.appendingPathComponent(".attachment-receiver.lock").path, O_RDWR | O_CREAT | O_NOFOLLOW, 0o600)
        guard candidate >= 0 else { throw posixError() }
        if flock(candidate, LOCK_EX | LOCK_NB) != 0 {
            let code = errno
            Darwin.close(candidate)
            if code == EWOULDBLOCK { throw invalid("attachment_receiver_busy") }
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(code))
        }
        descriptor = candidate
    }
    private func execute(_ call: CAPPluginCall) throws -> JSObject {
        let action = call.getString("action") ?? "", key = call.getString("key") ?? ""
        if action == "acquire" { try acquire(); return [:] }
        if action.hasPrefix("source-") { return try source(call, action: action, key: key) }
        let partial = call.getBool("partial") ?? false
        if action == "stat" { return try info(resolve(key, partial: partial), hash: !partial) }
        if action == "hash" { return ["hash": try digest(resolve(key, partial: partial))] }
        try acquire()
        return try mutate(call, action: action, key: key)
    }
    private func mutate(_ call: CAPPluginCall, action: String, key: String) throws -> JSObject {
        let file = try resolve(key, partial: true), manager = FileManager.default
        if action == "discard" {
            if manager.fileExists(atPath: file.path) { try manager.removeItem(at: file) }
        } else if action == "publish" {
            let target = try resolve(key, partial: false)
            if Darwin.rename(file.path, target.path) != 0 { throw posixError() }
        } else {
            let fd = Darwin.open(file.path, O_RDWR | O_CREAT | O_NOFOLLOW, 0o600)
            guard fd >= 0 else { throw posixError() }
            let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
            defer { try? handle.close() }
            if action == "truncate" { try handle.truncate(atOffset: number(call, "length")) }
            else if action == "append" {
                let offset = try number(call, "offset")
                guard let encoded = call.getString("base64"), let data = Data(base64Encoded: encoded),
                      data.count <= 524288, try handle.seekToEnd() == offset else { throw invalid("attachment_block_range_invalid") }
                try handle.write(contentsOf: data)
            } else { throw invalid("attachment_operation_invalid") }
        }
        return [:]
    }
    private func source(_ call: CAPPluginCall, action: String, key: String) throws -> JSObject {
        if action == "source-open" || action == "source-stat" {
            guard action == "source-stat" || sources[key] == nil else { throw invalid("attachment_send_busy") }
            var file = try resolve(key, partial: false)
            if !FileManager.default.fileExists(atPath: file.path) {
                file = try FolioleAttachmentMaintenanceFiles.directory(true).appendingPathComponent(key)
            }
            if action == "source-stat" { return try info(file, hash: false) }
            let result = try info(file, hash: true)
            if FileManager.default.fileExists(atPath: file.path) { sources[key] = try FileHandle(forReadingFrom: file) }
            return result
        }
        if action == "source-close" { try sources.removeValue(forKey: key)?.close(); return [:] }
        guard action == "source-read", let handle = sources[key] else { throw invalid("attachment_send_missing") }
        let offset = try number(call, "offset"), length = try number(call, "length")
        guard length <= 524288, offset + length <= (try handle.seekToEnd()) else { throw invalid("attachment_source_range_invalid") }
        try handle.seek(toOffset: offset)
        let data = try handle.read(upToCount: Int(length)) ?? Data()
        guard data.count == Int(length) else { throw invalid("attachment_source_truncated") }
        return ["base64": data.base64EncodedString()]
    }
    static func requireNotSending(_ key: String) throws {
        mutex.lock(); defer { mutex.unlock() }
        guard !owners.values.contains(where: { $0.sources[key] != nil }) else {
            throw FolioleFramedSyncValidationError("attachment_send_busy")
        }
    }
    static func withRemoval<T>(_ key: String, execute: () throws -> T) throws -> T {
        mutex.lock(); defer { mutex.unlock() }
        try requireNotSending(key)
        return try execute()
    }
    private func resolve(_ key: String, partial: Bool) throws -> URL {
        let valid = partial ? key.range(of: "^[a-f0-9]{64}(\\.(png|jpg|gif|webp|pdf|epub))?$", options: .regularExpression) != nil
            : FolioleCompanionCanonicalAttachmentKey.valid(key)
        guard valid else { throw invalid("attachment_key_invalid") }
        let file = root.appendingPathComponent(partial ? ".attachment-\(key.prefix(64)).partial" : key)
        guard file.resolvingSymlinksInPath().path == file.path else { throw invalid("attachment_file_unsafe") }
        return file
    }
    private func info(_ file: URL, hash: Bool) throws -> JSObject {
        guard FileManager.default.fileExists(atPath: file.path) else { return ["present": false, "length": 0, "hash": ""] }
        let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true, let length = values.fileSize else {
            throw invalid("attachment_file_unsafe")
        }
        return ["present": true, "length": length, "hash": hash ? try digest(file) : ""]
    }
    private func digest(_ file: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var hash = SHA256()
        while let bytes = try handle.read(upToCount: 65536), !bytes.isEmpty { hash.update(data: bytes) }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }
    private func number(_ call: CAPPluginCall, _ key: String) throws -> UInt64 {
        guard let value = call.getDouble(key), value.isFinite, value >= 0, value <= 8589934592, value.rounded() == value else {
            throw invalid("attachment_range_invalid")
        }
        return UInt64(value)
    }
    private func invalid(_ message: String) -> Error { FolioleFramedSyncValidationError(message) }
    private func posixError() -> Error { NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
}
