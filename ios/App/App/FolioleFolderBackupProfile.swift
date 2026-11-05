import Foundation
import Darwin

struct FolioleFolderBackupProfile: Codable {
    var id = UUID().uuidString
    var bookmark: Data
    var label: String
    var ownsTarget = false
    var targetCreationPending = false
    var fingerprint: String?
    var pendingFingerprint: String?
    var savedAt: String?
    var attachmentFilesPending: Int?
    var attachmentError: String?
}

final class FolioleFolderBackupProfileStore {
    private let lock = NSLock()
    private let file: URL

    init(file: URL? = nil) {
        self.file = file ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("folder-database-backup.json")
    }

    func load() throws -> FolioleFolderBackupProfile? {
        lock.lock(); defer { lock.unlock() }
        return try read()
    }

    func save(_ profile: FolioleFolderBackupProfile) throws {
        lock.lock(); defer { lock.unlock() }
        try write(profile)
    }

    func update(id: String, _ change: (inout FolioleFolderBackupProfile) -> Void) throws {
        lock.lock(); defer { lock.unlock() }
        guard var profile = try read(), profile.id == id else { throw backupError("Backup folder changed.") }
        change(&profile)
        try write(profile)
    }

    func clear() throws {
        lock.lock(); defer { lock.unlock() }
        if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
    }

    private func read() throws -> FolioleFolderBackupProfile? {
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        return try JSONDecoder().decode(FolioleFolderBackupProfile.self, from: Data(contentsOf: file))
    }

    private func write(_ profile: FolioleFolderBackupProfile) throws {
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(profile).write(to: file, options: .atomic)
        let descriptor = open(file.path, O_RDONLY)
        guard descriptor >= 0 else { throw backupError("Cannot open backup settings.") }
        defer { close(descriptor) }
        guard fsync(descriptor) == 0 else { throw backupError("Cannot save backup settings.") }
        let directory = open(file.deletingLastPathComponent().path, O_RDONLY)
        guard directory >= 0 else { throw backupError("Cannot open backup settings directory.") }
        defer { close(directory) }
        guard fsync(directory) == 0 else { throw backupError("Cannot persist backup settings directory.") }
    }
}

func backupError(_ message: String) -> Error {
    NSError(domain: "FolioleFolderBackup", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}
