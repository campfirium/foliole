import Darwin
import Foundation

/// Keeps every external operation inside the selected security scope and file coordination.
enum FolioleFolderBackupDirectory {
    static func access<T>(_ profile: FolioleFolderBackupProfile, execute: (URL) throws -> T) throws -> T {
        var stale = false
        let directory = try URL(resolvingBookmarkData: profile.bookmark, options: [], relativeTo: nil,
                                bookmarkDataIsStale: &stale)
        let access = directory.startAccessingSecurityScopedResource()
        defer { if access { directory.stopAccessingSecurityScopedResource() } }
        var error: NSError?
        var result: Result<T, Error> = .failure(backupError("Backup folder is unavailable."))
        NSFileCoordinator().coordinate(writingItemAt: directory, options: .forMerging, error: &error) { root in
            result = Result {
                let values = try root.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
                guard values.isDirectory == true, values.isSymbolicLink != true else {
                    throw backupError("Backup folder is unavailable.")
                }
                return try execute(root)
            }
        }
        if let error { throw error }
        return try result.get()
    }

    private static let journalSuffixes = ["-journal", "-wal", "-shm"]

    static func regularFile(_ url: URL) throws -> stat? {
        var info = stat()
        if lstat(url.path, &info) != 0 {
            guard errno == ENOENT else { throw backupError("Cannot check backup file.") }
            return nil
        }
        guard info.st_mode & S_IFMT == S_IFREG else { throw backupError("Invalid backup file.") }
        return info
    }

    static func publishReplacement(_ candidate: URL, to target: URL) throws {
        let staging = candidate.deletingLastPathComponent()
        // A journal from the former database must never be opened against the new one.
        for suffix in journalSuffixes {
            let original = URL(fileURLWithPath: target.path + suffix)
            if try regularFile(original) != nil {
                try FileManager.default.moveItem(at: original, to: staging.appendingPathComponent("previous" + suffix))
            }
        }
        guard rename(candidate.path, target.path) == 0 else { throw backupError("Cannot publish the replacement backup.") }
    }

    static func restoreReplacementJournals(_ target: URL, from staging: URL) throws {
        guard try replacementStagingExists(staging) else { return }
        for suffix in journalSuffixes {
            let retained = staging.appendingPathComponent("previous" + suffix)
            if try regularFile(retained) != nil {
                try FileManager.default.moveItem(at: retained, to: URL(fileURLWithPath: target.path + suffix))
            }
        }
    }

    static func replacementStagingExists(_ staging: URL) throws -> Bool {
        var info = stat()
        if lstat(staging.path, &info) != 0 {
            guard errno == ENOENT else { throw backupError("Cannot check replacement staging folder.") }
            return false
        }
        guard info.st_mode & S_IFMT == S_IFDIR else { throw backupError("Invalid replacement staging folder.") }
        return true
    }

    static func removeReplacementStaging(_ staging: URL) throws {
        if try replacementStagingExists(staging) { try FileManager.default.removeItem(at: staging) }
    }
}
