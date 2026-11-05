import Foundation
import SQLCipher
import Darwin

final class FolioleFolderBackupOperation {
    let requestID: String
    let epoch: String
    let source: String
    private let lock = NSLock()
    private var job: OpaquePointer?
    private var cancelled = false
    private var released = false
    private var releaseCallbacks: [() -> Void] = []
    let store: FolioleFolderBackupProfileStore
    var profileID = ""
    var preparedFingerprint: String?
    var callbackError: Error?

    init(requestID: String, epoch: String, source: String, store: FolioleFolderBackupProfileStore) {
        self.requestID = requestID
        self.epoch = epoch
        self.source = source
        self.store = store
    }

    func cancel(afterSourceReleased callback: (() -> Void)? = nil) {
        lock.lock()
        cancelled = true
        if let job { foliole_backup_cancel(job) }
        let immediate = released || job == nil
        if !immediate, let callback { releaseCallbacks.append(callback) }
        lock.unlock()
        if immediate { callback?() }
    }

    func sourceReleased() {
        lock.lock()
        released = true
        let callbacks = releaseCallbacks
        releaseCallbacks = []
        lock.unlock()
        callbacks.forEach { $0() }
    }

    func run(directory: URL, profile: FolioleFolderBackupProfile, filename: String) throws -> FolioleBackupResult {
        let target = directory.appendingPathComponent(filename)
        try checkActive()
        try prepareTarget(target, profile: profile)
        profileID = profile.id
        var options = FolioleBackupOptions()
        options.timeoutMilliseconds = 30_000
        options.context = Unmanaged.passUnretained(self).toOpaque()
        options.snapshotPrepared = { context, fingerprint in
            guard let context, let fingerprint else { return SQLITE_MISUSE }
            let operation = Unmanaged<FolioleFolderBackupOperation>.fromOpaque(context).takeUnretainedValue()
            do {
                let value = String(cString: fingerprint)
                try operation.store.update(id: operation.profileID) { $0.pendingFingerprint = value }
                operation.preparedFingerprint = value
                return SQLITE_OK
            } catch { operation.callbackError = error; return SQLITE_IOERR }
        }
        options.transactionCommitted = { context in
            guard let context else { return }
            let operation = Unmanaged<FolioleFolderBackupOperation>.fromOpaque(context).takeUnretainedValue()
            do {
                try operation.store.update(id: operation.profileID) {
                    $0.fingerprint = operation.preparedFingerprint
                    $0.pendingFingerprint = nil
                    $0.savedAt = ISO8601DateFormatter().string(from: Date())
                }
            } catch { operation.callbackError = error }
        }
        options.sourceReleased = { context in
            guard let context else { return }
            Unmanaged<FolioleFolderBackupOperation>.fromOpaque(context).takeUnretainedValue().sourceReleased()
        }
        let expected = profile.fingerprint.flatMap { strdup($0) }
        let pending = profile.pendingFingerprint.flatMap { strdup($0) }
        defer { if let expected { free(expected) }; if let pending { free(pending) } }
        options.expectedFingerprint = expected.map { UnsafePointer($0) }
        options.pendingFingerprint = pending.map { UnsafePointer($0) }
        guard let handle = foliole_backup_create(source, target.path, &options) else {
            throw backupError("Cannot initialize database backup.")
        }
        lock.lock()
        job = handle
        if cancelled { foliole_backup_cancel(handle) }
        lock.unlock()
        var result = FolioleBackupResult()
        foliole_backup_run(handle, &result)
        lock.lock()
        job = nil
        foliole_backup_destroy(handle)
        lock.unlock()
        sourceReleased()
        if let callbackError { throw callbackError }
        guard result.code == SQLITE_OK else {
            let message = withUnsafePointer(to: &result.message) {
                $0.withMemoryRebound(to: CChar.self, capacity: 256) { String(cString: $0) }
            }
            throw backupError(message)
        }
        return result
    }

    func checkActive() throws {
        lock.lock(); defer { lock.unlock() }
        if cancelled { throw backupError("Backup cancelled.") }
    }

    private func prepareTarget(_ target: URL, profile: FolioleFolderBackupProfile) throws {
        var info = stat()
        if lstat(target.path, &info) == 0 {
            guard info.st_mode & S_IFMT == S_IFREG,
                  profile.ownsTarget || (profile.targetCreationPending && info.st_size == 0) else {
                throw backupError("This folder already contains an unrecognized backup file. Choose another folder.")
            }
            if !profile.ownsTarget {
                try store.update(id: profile.id) { $0.ownsTarget = true; $0.targetCreationPending = false }
            }
            var sourceInfo = stat()
            guard stat(source, &sourceInfo) == 0,
                  info.st_dev != sourceInfo.st_dev || info.st_ino != sourceInfo.st_ino else {
                throw backupError("Backup destination is the active database.")
            }
        } else {
            guard errno == ENOENT, !profile.ownsTarget else { throw backupError("Backup file is missing or inaccessible.") }
            try store.update(id: profile.id) { $0.targetCreationPending = true }
            let descriptor = open(target.path, O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW, S_IRUSR | S_IWUSR)
            guard descriptor >= 0 else { throw backupError("Cannot create backup file.") }
            close(descriptor)
            try store.update(id: profile.id) { $0.ownsTarget = true; $0.targetCreationPending = false }
        }
    }
}
