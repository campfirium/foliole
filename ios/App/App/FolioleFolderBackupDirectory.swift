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
}
