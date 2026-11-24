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

    static func publishReplacement(_ candidate: URL, to target: URL, retainStaging: inout Bool) throws {
        let files = FileManager.default
        let staging = candidate.deletingLastPathComponent()
        var displaced: [(original: URL, retained: URL)] = []
        do {
            // A journal from the former database must never be opened against the new one.
            for suffix in ["-journal", "-wal", "-shm"] {
                let original = URL(fileURLWithPath: target.path + suffix)
                var info = stat()
                if lstat(original.path, &info) != 0 {
                    guard errno == ENOENT else { throw backupError("Cannot check the previous backup journal.") }
                    continue
                }
                guard info.st_mode & S_IFMT == S_IFREG else { throw backupError("Invalid previous backup journal.") }
                let retained = staging.appendingPathComponent("previous" + suffix)
                try files.moveItem(at: original, to: retained)
                displaced.append((original, retained))
            }
            guard rename(candidate.path, target.path) == 0 else { throw backupError("Cannot publish the replacement backup.") }
        } catch {
            for (original, retained) in displaced.reversed() {
                do { try files.moveItem(at: retained, to: original) }
                catch { retainStaging = true }
            }
            if retainStaging { throw backupError("Backup replacement was interrupted. Recovery files are in \(staging.lastPathComponent).") }
            throw error
        }
    }
}
