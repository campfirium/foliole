import CryptoKit
import Darwin
import Foundation
import FolioleFramedSyncRuntime

final class FolioleAttachmentBlockStorage {
    private let mutex = NSRecursiveLock()
    private var operations = 0
    private var activeKeys = Set<String>()
    private let root: URL
    private let trash: () throws -> URL
    private var descriptor: Int32 = -1
    private var sources = [String: FileHandle]()
    private var receiving = Set<String>()
    private var closing = false

    init(root: URL, trash: @escaping () throws -> URL) throws {
        self.root = root
        self.trash = trash
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    func close() {
        mutex.lock(); defer { mutex.unlock() }
        closing = true
        if !receiving.isEmpty || operations > 0 { return }
        for handle in sources.values { try? handle.close() }
        sources.removeAll()
        if descriptor >= 0 { Darwin.close(descriptor); descriptor = -1 }
    }

    func receive(key: String, offset: UInt64, check: @escaping () throws -> Void,
                 finished: @escaping () -> Void) throws -> FolioleAttachmentReceiveFile {
        mutex.lock(); defer { mutex.unlock() }
        guard !closing, !activeKeys.contains(String(key.prefix(64))), !receiving.contains(where: { $0.prefix(64) == key.prefix(64) }), sources[key] == nil else { throw invalid("attachment_receive_busy") }
        try acquire()
        let file = try FolioleAttachmentReceiveFile(path: resolve(key, partial: true), offset: offset, check: check, finished: finished)
        receiving.insert(key)
        return file
    }
    func finishReceive(_ key: String) {
        mutex.lock(); defer { mutex.unlock() }
        receiving.remove(key)
        if closing { close() }
    }
    func isSending(_ key: String) -> Bool {
        mutex.lock(); defer { mutex.unlock() }
        return sources.keys.contains { $0.prefix(64) == key.prefix(64) }
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
    func execute(action: String, key: String, partial: Bool = false, keys: [String] = [],
                 number: (String) -> Double? = { _ in nil }, base64: String? = nil,
                 check: () throws -> Void = {}) throws -> [String: Any] {
        if action == "source-stat-batch" { return try sourceStatBatch(keys) }
        if action == "source-stat" || (action == "stat" && partial) {
            return try inspect(action: action, key: key, partial: partial, check: check)
        }
        let hash = String(key.prefix(64))
        mutex.lock()
        guard !closing, !activeKeys.contains(hash), !receiving.contains(where: { $0.prefix(64) == hash }) else {
            mutex.unlock(); throw invalid("attachment_receive_busy")
        }
        operations += 1; activeKeys.insert(hash)
        mutex.unlock()
        defer {
            mutex.lock(); operations -= 1; activeKeys.remove(hash)
            if closing { close() }
            mutex.unlock()
        }
        try check()
        if action == "hash" { return ["hash": try digest(resolve(key, partial: partial), check: check)] }
        if action == "stat" { return try info(resolve(key, partial: partial), hash: !partial, check: check) }
        mutex.lock(); defer { mutex.unlock() }
        if action == "acquire" { try acquire(); return [:] }
        if action.hasPrefix("source-") { return try source(action: action, key: key, number: number) }
        try acquire()
        return try mutate(action: action, key: key, number: number, base64: base64)
    }
    private func inspect(action: String, key: String, partial: Bool, check: () throws -> Void) throws -> [String: Any] {
        mutex.lock(); defer { mutex.unlock() }
        guard !closing else { throw invalid("attachment_receive_busy") }
        try check()
        if action == "stat" { return try info(resolve(key, partial: partial), hash: false) }
        return try source(action: action, key: key, number: { _ in nil })
    }
    private func sourceStatBatch(_ keys: [String]) throws -> [String: Any] {
        guard keys.count <= 64, keys.reduce(0, { $0 + $1.utf8.count }) <= 16384 else {
            throw invalid("attachment_stat_batch_invalid")
        }
        for key in keys { _ = try resolve(key, partial: false) }
        return ["presence": try keys.map { key in
            try execute(action: "source-stat", key: key)["present"] as! Bool
        }]
    }
    private func mutate(action: String, key: String, number: (String) -> Double?,
                        base64: String?) throws -> [String: Any] {
        guard !receiving.contains(where: { $0.prefix(64) == key.prefix(64) }) else { throw invalid("attachment_receive_busy") }
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
            if action == "truncate" { try handle.truncate(atOffset: readNumber(number, "length")) }
            else if action == "append" {
                let offset = try readNumber(number, "offset")
                guard let encoded = base64, let data = Data(base64Encoded: encoded),
                      data.count <= 524288, try handle.seekToEnd() == offset else { throw invalid("attachment_block_range_invalid") }
                try handle.write(contentsOf: data)
            } else { throw invalid("attachment_operation_invalid") }
        }
        return [:]
    }
    private func source(action: String, key: String, number: (String) -> Double?) throws -> [String: Any] {
        if action == "source-open" || action == "source-stat" {
            guard action == "source-stat" || !receiving.contains(key) else { throw invalid("attachment_receive_busy") }
            guard action == "source-stat" || sources[key] == nil else { throw invalid("attachment_send_busy") }
            var file = try resolve(key, partial: false)
            if !FileManager.default.fileExists(atPath: file.path) {
                file = try trash().appendingPathComponent(key)
            }
            if action == "source-stat" { return try info(file, hash: false) }
            let result = try info(file, hash: false)
            if FileManager.default.fileExists(atPath: file.path) { sources[key] = try FileHandle(forReadingFrom: file) }
            return result
        }
        if action == "source-close" { try sources.removeValue(forKey: key)?.close(); return [:] }
        guard action == "source-read", let handle = sources[key] else { throw invalid("attachment_send_missing") }
        let offset = try readNumber(number, "offset"), length = try readNumber(number, "length")
        guard length <= 524288, offset + length <= (try handle.seekToEnd()) else { throw invalid("attachment_source_range_invalid") }
        try handle.seek(toOffset: offset)
        let data = try handle.read(upToCount: Int(length)) ?? Data()
        guard data.count == Int(length) else { throw invalid("attachment_source_truncated") }
        return ["base64": data.base64EncodedString()]
    }
    private func resolve(_ key: String, partial: Bool) throws -> URL {
        let valid = partial ? key.range(of: "^[a-f0-9]{64}(\\.(png|jpg|gif|webp|pdf|epub|pdftext))?$", options: .regularExpression) != nil
            : FolioleCompanionCanonicalAttachmentKey.valid(key)
        guard valid else { throw invalid("attachment_key_invalid") }
        let file = root.appendingPathComponent(partial ? ".attachment-\(key.prefix(64)).partial" : key)
        guard file.resolvingSymlinksInPath().path == file.path else { throw invalid("attachment_file_unsafe") }
        return file
    }
    private func info(_ file: URL, hash: Bool, check: () throws -> Void = {}) throws -> [String: Any] {
        guard FileManager.default.fileExists(atPath: file.path) else { return ["present": false, "length": 0, "hash": ""] }
        let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true, let length = values.fileSize else {
            throw invalid("attachment_file_unsafe")
        }
        return ["present": true, "length": length, "hash": hash ? try digest(file, check: check) : ""]
    }
    private func digest(_ file: URL, check: () throws -> Void) throws -> String {
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var hash = SHA256()
        while let bytes = try handle.read(upToCount: 65536), !bytes.isEmpty { try check(); hash.update(data: bytes) }
        try check()
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }
    private func readNumber(_ number: (String) -> Double?, _ key: String) throws -> UInt64 {
        guard let value = number(key), value.isFinite, value >= 0, value <= 8589934592, value.rounded() == value else {
            throw invalid("attachment_range_invalid")
        }
        return UInt64(value)
    }
    private func invalid(_ message: String) -> Error { FolioleFramedSyncValidationError(message) }
    private func posixError() -> Error { NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
}
