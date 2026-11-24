import Foundation
import Darwin

struct FolioleFolderBackupReplacement: Codable {
    let id: UUID
    let originalDevice: Int32
    let originalInode: UInt64
    var fingerprint: String?

    func containsOriginal(_ info: stat) -> Bool {
        info.st_dev == originalDevice && info.st_ino == originalInode
    }

    func staging(in directory: URL) -> URL {
        directory.appendingPathComponent(".foliole-backup-\(id.uuidString).partial")
    }
}

struct FolioleFolderBackupProfile: Codable {
    var id = UUID().uuidString
    var bookmark: Data
    var label: String
    var ownsTarget = false
    var targetCreationPending = false
    var fingerprint: String?
    var pendingFingerprint: String?
    var replacement: FolioleFolderBackupReplacement?
    var savedAt: String?
    var attachmentFilesPending: Int?
    var attachmentError: String?
    /// The durable round phase; `working` from a round that never ended reopens as an interrupted retry.
    var phase: String?
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

/// The folder backup round state machine, free of UIKit and Capacitor so the Mac host can test it. A round is open
/// from `begin` until `finished`, `cancel`, `fail` or a reclaim ends it, and every end persists saved, pending or
/// failed. The durable phase stays `working` until the round ends, so a killed process reopens as interrupted.
/// Callers use it from the main queue.
final class FolioleFolderBackupRound {
    static let interrupted = "Backup interrupted. Use Back up now to retry."
    static let reloaded = "Backup interrupted because the app reloaded. Use Back up now to retry."

    private(set) var phase: String
    private(set) var errorMessage: String?
    private(set) var epoch: String?
    /// The request whose round is open; only it may end the round.
    private(set) var request: String?
    /// The open round's folder picker or database operation is still in flight.
    private(set) var running = false
    private var reclaimed: String?
    private let save: (String, String?) -> Void

    init(resumed phase: String?, save: @escaping (String, String?) -> Void) {
        self.save = save
        if phase == "working" {
            self.phase = "pending"
            errorMessage = Self.interrupted
            save(self.phase, errorMessage)
        } else {
            self.phase = phase ?? "idle"
            errorMessage = nil
        }
    }

    func owns(_ requestID: String?) -> Bool { requestID != nil && requestID == request }

    /// `reclaim` comes from the first owner of a newly loaded page: anything still registered belongs to a page that is
    /// gone, so its round ends as interrupted. Returns false while that page's picker or operation is still running.
    func open(_ next: String, reclaim: Bool) throws -> Bool {
        let foreign = epoch != next
        if epoch != nil, foreign, !reclaim { throw backupError("Previous database owner is still open.") }
        if reclaim, foreign {
            epoch = nil
            if running { reclaimed = request; return false }
            if request != nil { interrupt(Self.reloaded) }
        }
        epoch = next
        return true
    }

    func close(_ sourceEpoch: String?) -> Bool {
        guard let epoch, epoch == sourceEpoch else { return false }
        self.epoch = nil
        return true
    }

    /// A round left open for attachments is superseded by the next request; a running one rejects it.
    func begin(_ sourceEpoch: String?, request requestID: String?) throws {
        if running { throw backupError("A backup is already running.") }
        guard let epoch, epoch == sourceEpoch, let requestID, !requestID.isEmpty else { throw backupError("Database owner is closed.") }
        request = requestID
        running = true
    }

    func started() {
        phase = "working"
        errorMessage = nil
        save(phase, nil)
    }

    /// The folder picker closed without a choice.
    func pickerCancelled(_ requestID: String) {
        guard owns(requestID) else { return }
        running = false
        if take(requestID) { interrupt(Self.reloaded) } else { request = nil }
    }

    /// The database operation returned. Returns true when the round stays open for attachments.
    func databaseEnded(_ requestID: String, committed: Bool, cleanupPending: Bool) -> Bool {
        running = false
        if take(requestID) { interrupt(Self.reloaded); return false }
        guard owns(requestID) else { return false }
        phase = cleanupPending ? "pending" : "saved"
        if !committed { request = nil; save(phase, nil); return false }
        return true
    }

    func databaseFailed(_ requestID: String, message: String) {
        running = false
        if take(requestID) { interrupt(Self.reloaded); return }
        fail(message)
    }

    /// Releases the round for its caller: with a failure it ends as failed with that error, otherwise it keeps the
    /// database result. Returns true when the round was released.
    func cancel(_ requestID: String?, failure: String?) -> Bool {
        guard owns(requestID), !running else { return false }
        request = nil
        if let failure, !failure.isEmpty { phase = "failed"; errorMessage = failure }
        else if phase == "working" { phase = "pending" }
        save(phase, errorMessage)
        return true
    }

    func finished(failure: String?, pending: Int?) {
        errorMessage = failure
        phase = failure != nil ? "failed" : pending == 0 ? "saved" : "pending"
        request = nil
        save(phase, failure)
    }

    func fail(_ message: String) {
        request = nil
        running = false
        phase = "failed"
        errorMessage = message
        save(phase, message)
    }

    func clear() throws {
        if running { throw backupError("A backup is already running.") }
        request = nil
        phase = "idle"
        errorMessage = nil
    }

    private func take(_ requestID: String) -> Bool {
        guard reclaimed == requestID else { return false }
        reclaimed = nil
        return true
    }

    private func interrupt(_ message: String) {
        request = nil
        phase = "pending"
        errorMessage = message
        save(phase, message)
    }
}

func backupError(_ message: String) -> Error {
    NSError(domain: "FolioleFolderBackup", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}
