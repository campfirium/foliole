import CryptoKit
import Foundation

/// App-private staging copy of one backup. Only verified files land here: the database must
/// start with the SQLite header, an attachment must match the hash in its name, and a
/// non-empty journal means the backup was written halfway. The active library is never touched.
/// Sources push bytes through `Chunks`, so a picked file, a zip entry or a download can feed it.
final class FolioleBackupRestoreStaging {
    typealias Chunks = ((Data) throws -> Void) throws -> Void

    private static let sqliteHeader = Data("SQLite format 3\0".utf8)
    let database: URL
    let attachments: URL
    private let cancelled: () -> Bool
    private let progress: ((Int64, Int) -> Void)?
    private(set) var stagedKeys: [String] = []
    private var staged = Set<String>()
    private var hasDatabase = false
    private(set) var skippedFiles = 0
    private(set) var damagedFiles = 0
    private var files = 0
    private var bytes: Int64 = 0

    init(database: URL, attachments: URL, cancelled: @escaping () -> Bool = { false },
         progress: ((Int64, Int) -> Void)? = nil) {
        self.database = database
        self.attachments = attachments
        self.cancelled = cancelled
        self.progress = progress
    }

    func reset() throws {
        for suffix in FolioleBackupRestoreSwap.databaseSuffixes { try Self.deleteTree(URL(fileURLWithPath: database.path + suffix)) }
        try Self.deleteTree(attachments)
        do {
            try FileManager.default.createDirectory(at: database.deletingLastPathComponent(), withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: attachments, withIntermediateDirectories: true)
        } catch { throw restoreError("restore_staging_unavailable") }
    }

    func database(_ chunks: Chunks) throws {
        if hasDatabase { throw restoreError("restore_multiple_backups") }
        let output = try Self.create(database)
        defer { try? output.close() }
        var header = Data()
        try chunks { data in
            var data = data
            if header.count < Self.sqliteHeader.count {
                let needed = Self.sqliteHeader.count - header.count
                header.append(data.prefix(needed))
                data = data.dropFirst(needed)
                if header.count == Self.sqliteHeader.count {
                    guard header == Self.sqliteHeader else { throw restoreError("restore_not_database") }
                    try self.write(header, to: output)
                }
            }
            if !data.isEmpty { try self.write(data, to: output) }
        }
        guard header == Self.sqliteHeader else { throw restoreError("restore_not_database") }
        try output.synchronize()
        hasDatabase = true
        counted()
    }

    /// A rollback journal or WAL left beside the copy means the backup did not finish.
    func sidecar(_ chunks: Chunks) throws {
        try chunks { data in if !data.isEmpty { throw restoreError("restore_backup_incomplete") } }
    }

    func attachment(_ name: String, _ chunks: Chunks) throws {
        guard FolioleCompanionCanonicalAttachmentKey.valid(name) else { skippedFiles += 1; return }
        if staged.contains(name) { return }
        let partial = attachments.appendingPathComponent(name + ".partial")
        var hash = SHA256()
        do {
            let output = try Self.create(partial)
            defer { try? output.close() }
            try chunks { data in
                hash.update(data: data)
                try self.write(data, to: output)
            }
            try output.synchronize()
        }
        let digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
        guard digest == String(name.prefix(64)) else {
            try? FileManager.default.removeItem(at: partial)
            damagedFiles += 1
            return
        }
        guard Darwin.rename(partial.path, attachments.appendingPathComponent(name).path) == 0 else {
            throw restoreError("restore_staging_unavailable")
        }
        staged.insert(name)
        stagedKeys.append(name)
        counted()
    }

    func finish() throws {
        if !hasDatabase { throw restoreError("restore_not_backup") }
    }

    private func write(_ data: Data, to output: FileHandle) throws {
        if cancelled() { throw FolioleRestoreCancelled() }
        try output.write(contentsOf: data)
        bytes += Int64(data.count)
    }

    private func counted() {
        files += 1
        progress?(bytes, files)
    }

    private static func create(_ url: URL) throws -> FileHandle {
        guard FileManager.default.createFile(atPath: url.path, contents: nil),
              let handle = FileHandle(forWritingAtPath: url.path) else { throw restoreError("restore_staging_unavailable") }
        return handle
    }

    /// Feeds a local file to the staging area in chunks.
    static func file(_ url: URL) -> Chunks {
        return { sink in
            let input: FileHandle
            do { input = try FileHandle(forReadingFrom: url) } catch { throw restoreError("restore_source_unreadable") }
            defer { try? input.close() }
            while let data = try input.read(upToCount: 64 * 1024), !data.isEmpty { try sink(data) }
        }
    }

    static func deleteTree(_ url: URL) throws {
        let manager = FileManager.default
        guard (try? url.checkResourceIsReachable()) == true || manager.fileExists(atPath: url.path) else { return }
        do { try manager.removeItem(at: url) } catch { throw restoreError("restore_staging_busy") }
    }
}
