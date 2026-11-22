import Darwin
import Foundation

/// Replaces the library files with a verified staged candidate by renames only. The replaced
/// library moves into one "previous" slot so it can be put back. A marker records the phase;
/// every phase only moves what is still in its old place, so an interrupted swap is finished
/// on the next start before any database opens, instead of leaving no library behind.
/// The staged candidate may come from any source: a picked backup or a library prepared elsewhere.
final class FolioleBackupRestoreSwap {
    static let databaseSuffixes = ["", "-wal", "-shm", "-journal"]
    private let database: URL, stagedDatabase: URL, files: URL, stagingRoot: URL
    private let stagedAttachments: URL, libraryFiles: [String], directories: [String]
    private let previous: URL, partial: URL, marker: URL

    /// `files` holds the library's attachment folders and state files; `stagingRoot` mirrors them by name.
    init(database: URL, stagedDatabase: URL, files: URL, stagingRoot: URL, attachmentDirectory: String) {
        self.database = database
        self.stagedDatabase = stagedDatabase
        self.files = files
        self.stagingRoot = stagingRoot
        stagedAttachments = stagingRoot.appendingPathComponent(attachmentDirectory, isDirectory: true)
        directories = [attachmentDirectory, attachmentDirectory + ".trash"]
        libraryFiles = directories + ["folder-database-backup.json", "attachment-observations.json"]
        previous = files.appendingPathComponent("restore-previous", isDirectory: true)
        partial = files.appendingPathComponent("restore-previous.partial", isDirectory: true)
        marker = files.appendingPathComponent("restore-commit")
    }

    var interrupted: Bool { exists(marker) }
    var hasPrevious: Bool { exists(previous.appendingPathComponent("saved-at")) }

    func previousSavedAt() throws -> String? {
        hasPrevious ? try read(previous.appendingPathComponent("saved-at")) : nil
    }

    func commit(_ now: String) throws {
        if !interrupted {
            guard exists(stagedDatabase), isDirectory(stagedAttachments) else { throw restoreError("restore_nothing_staged") }
            try write(marker, "prepare")
        }
        var phase = try read(marker)
        if phase == "revert" {
            let slot = previous.appendingPathComponent("database", isDirectory: true)
            for suffix in Self.databaseSuffixes {
                try move(slot.appendingPathComponent(database.lastPathComponent + suffix), sibling(stagedDatabase, suffix))
            }
            try makeDirectory(stagingRoot)
            for name in libraryFiles { try move(previous.appendingPathComponent(name), stagingRoot.appendingPathComponent(name)) }
            guard exists(stagedDatabase) else { throw restoreError("restore_swap_database_missing") }
            phase = "prepare"
            try write(marker, phase)
        }
        if phase == "prepare" {
            try FolioleBackupRestoreStaging.deleteTree(previous)
            try makeDirectory(partial)
            try write(partial.appendingPathComponent("saved-at"), now)
            phase = "move"
            try write(marker, phase)
        }
        if phase == "move" {
            if isDirectory(partial) {
                let slot = partial.appendingPathComponent("database", isDirectory: true)
                try makeDirectory(slot)
                for suffix in Self.databaseSuffixes {
                    try move(sibling(database, suffix), slot.appendingPathComponent(database.lastPathComponent + suffix))
                }
                for name in libraryFiles { try move(files.appendingPathComponent(name), partial.appendingPathComponent(name)) }
                try rename(partial, previous)
            }
            phase = "install"
            try write(marker, phase)
        }
        guard phase == "install" else { throw restoreError("restore_swap_marker_invalid") }
        for suffix in Self.databaseSuffixes where !suffix.isEmpty { try move(sibling(stagedDatabase, suffix), sibling(database, suffix)) }
        try move(stagedDatabase, database)
        for name in libraryFiles { try move(stagingRoot.appendingPathComponent(name), files.appendingPathComponent(name)) }
        for name in directories { try makeDirectory(files.appendingPathComponent(name, isDirectory: true)) }
        try FolioleBackupRestoreStaging.deleteTree(stagingRoot)
        guard exists(database) else { throw restoreError("restore_swap_database_missing") }
        guard Darwin.unlink(marker.path) == 0 else { throw restoreError("restore_swap_unavailable") }
    }

    /// Put the previous library back. The library it replaces takes the previous slot, so
    /// reverting is itself reversible; an unfinished staged backup is discarded first.
    func revert(_ now: String) throws {
        if !interrupted {
            guard hasPrevious else { throw restoreError("restore_no_previous") }
            for suffix in Self.databaseSuffixes { try FolioleBackupRestoreStaging.deleteTree(sibling(stagedDatabase, suffix)) }
            try FolioleBackupRestoreStaging.deleteTree(stagingRoot)
            try write(marker, "revert")
        }
        try commit(now)
    }

    /// Move only what is still at its source; a destination that already exists is never overwritten.
    private func move(_ source: URL, _ target: URL) throws {
        guard exists(source) else { return }
        if exists(target) { throw restoreError("restore_swap_target_exists") }
        try rename(source, target)
    }

    private func rename(_ source: URL, _ target: URL) throws {
        guard Darwin.rename(source.path, target.path) == 0 else { throw restoreError("restore_swap_unavailable") }
    }

    private func makeDirectory(_ url: URL) throws {
        if isDirectory(url) { return }
        do { try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true) }
        catch { throw restoreError("restore_swap_unavailable") }
    }

    private func write(_ file: URL, _ value: String) throws {
        let temporary = URL(fileURLWithPath: file.path + ".tmp")
        guard FileManager.default.createFile(atPath: temporary.path, contents: Data(value.utf8)),
              let handle = FileHandle(forWritingAtPath: temporary.path) else { throw restoreError("restore_swap_unavailable") }
        defer { try? handle.close() }
        try handle.synchronize()
        try rename(temporary, file)
    }

    private func read(_ file: URL) throws -> String {
        do { return try String(contentsOf: file, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) }
        catch { throw restoreError("restore_swap_unavailable") }
    }

    private func sibling(_ url: URL, _ suffix: String) -> URL { URL(fileURLWithPath: url.path + suffix) }
    private func exists(_ url: URL) -> Bool { FileManager.default.fileExists(atPath: url.path) }
    private func isDirectory(_ url: URL) -> Bool {
        var directory: ObjCBool = false
        return FileManager.default.fileExists(atPath: url.path, isDirectory: &directory) && directory.boolValue
    }
}
