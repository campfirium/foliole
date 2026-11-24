import CryptoKit
import Darwin
import Foundation

/// Native file operations only; the shared durable work consumer owns copy/delete intent.
enum FolioleFolderBackupAttachments {
    static func prepare(_ directory: URL, create: Bool) throws -> URL? {
        let folder = directory.appendingPathComponent("Attachments", isDirectory: true)
        var info = stat()
        if lstat(folder.path, &info) != 0 {
            guard errno == ENOENT else { throw backupError("Cannot read backup attachment folder.") }
            guard create else { return nil }
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
            guard lstat(folder.path, &info) == 0 else { throw backupError("Cannot create backup attachment folder.") }
        }
        guard info.st_mode & S_IFMT == S_IFDIR else { throw backupError("Invalid backup attachment folder.") }
        return folder
    }

    private static func requireDirectory(_ directory: URL) throws -> URL {
        guard let folder = try prepare(directory, create: false) else { throw backupError("Backup attachment folder was removed.") }
        return folder
    }

    /// Publishes one verified copy; the folder entry becomes durable with `persist`.
    static func copy(_ key: String, roots: [URL], directory: URL, profile: String,
                     check: () throws -> Void) throws -> Bool {
        try validate(key)
        try check()
        let target = try requireDirectory(directory).appendingPathComponent(key)
        guard let source = try source(key, roots: roots) else { throw backupError("Source attachment is missing.") }
        let expected = String(key.prefix(64))
        if exists(target) {
            guard try hash(target, check: check) == expected else { throw backupError("Backup attachment changed outside Foliole.") }
            return false
        }
        let partial = target.deletingLastPathComponent().appendingPathComponent(".foliole-\(profile)-\(key).partial")
        if exists(partial) { try regular(partial); try FileManager.default.removeItem(at: partial) }
        let descriptor = open(partial.path, O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw backupError("Cannot create backup attachment.") }
        let output = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? output.close(); try? FileManager.default.removeItem(at: partial) }
        // The bytes are hashed as written and synced; reading them back would only re-read the page cache.
        // Restore verifies each file against the hash in its name.
        guard try hash(source, output: output, check: check) == expected else { throw backupError("Source attachment is damaged.") }
        try output.synchronize()
        try output.close()
        try check()
        guard renameatx_np(AT_FDCWD, partial.path, AT_FDCWD, target.path, UInt32(RENAME_EXCL)) == 0 else {
            throw backupError("Cannot publish backup attachment without replacing an existing file.")
        }
        return true
    }

    /// Makes the renames of a batch durable once; callers persist before reporting copies as complete.
    static func persist(_ directory: URL) throws {
        try syncDirectory(try requireDirectory(directory))
    }

    static func delete(_ key: String, roots: [URL], directory: URL, check: () throws -> Void) throws {
        try validate(key)
        try check()
        for root in roots {
            let values = try root.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
            guard values.isDirectory == true, values.isSymbolicLink != true,
                  FileManager.default.isReadableFile(atPath: root.path), !exists(root.appendingPathComponent(key)) else {
                throw backupError("Source attachment still exists or cannot be checked.")
            }
        }
        let target = try requireDirectory(directory).appendingPathComponent(key)
        if !exists(target) { return }
        guard try hash(target, check: check) == String(key.prefix(64)) else { throw backupError("Backup attachment changed outside Foliole.") }
        try check()
        try FileManager.default.removeItem(at: target)
        try syncDirectory(target.deletingLastPathComponent())
    }

    private static func source(_ key: String, roots: [URL]) throws -> URL? {
        for root in roots {
            let file = root.appendingPathComponent(key)
            if exists(file) { try regular(file); return file }
        }
        return nil
    }

    private static func hash(_ file: URL, output: FileHandle? = nil, check: () throws -> Void) throws -> String {
        try regular(file)
        let descriptor = open(file.path, O_RDONLY | O_NOFOLLOW)
        guard descriptor >= 0 else { throw backupError("Cannot read attachment.") }
        let input = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
        defer { try? input.close() }
        var digest = SHA256()
        while true {
            try check()
            guard let data = try input.read(upToCount: 64 * 1024), !data.isEmpty else { break }
            digest.update(data: data)
            try output?.write(contentsOf: data)
        }
        try check()
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private static func exists(_ file: URL) -> Bool {
        var info = stat()
        return lstat(file.path, &info) == 0 || errno != ENOENT
    }

    private static func regular(_ file: URL) throws {
        var info = stat()
        guard lstat(file.path, &info) == 0, info.st_mode & S_IFMT == S_IFREG else { throw backupError("Invalid attachment file.") }
    }

    private static func validate(_ key: String) throws {
        guard FolioleCompanionCanonicalAttachmentKey.valid(key) else { throw backupError("Invalid attachment name.") }
    }

    private static func syncDirectory(_ directory: URL) throws {
        let descriptor = open(directory.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard descriptor >= 0 else { throw backupError("Cannot open backup attachment folder.") }
        defer { close(descriptor) }
        guard fsync(descriptor) == 0 else { throw backupError("Cannot persist backup attachment folder.") }
    }
}
