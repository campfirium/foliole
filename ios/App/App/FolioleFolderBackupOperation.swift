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
    private var stagingReplacement = false
    /// The user confirmed replacing a backup this profile does not own.
    let replaceExisting: Bool

    init(requestID: String, epoch: String, source: String, store: FolioleFolderBackupProfileStore, replaceExisting: Bool = false) {
        self.requestID = requestID
        self.epoch = epoch
        self.source = source
        self.store = store
        self.replaceExisting = replaceExisting
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

    func run(directory: URL, profile selected: FolioleFolderBackupProfile, filename: String) throws -> FolioleBackupResult {
        let target = directory.appendingPathComponent(filename)
        try checkActive()
        profileID = selected.id
        if let replacement = selected.replacement,
           let result = try recoverReplacement(replacement, at: target, profile: selected) { return result }
        guard let profile = try store.load(), profile.id == selected.id else { throw backupError("Backup folder changed.") }
        if let original = try replacementOrigin(target, profile: profile) {
            return try replaceTarget(target, original: original)
        }
        let prepared = try prepareTarget(target, profile: profile)
        return try writeSnapshot(to: target, expected: prepared.fingerprint, pending: prepared.pendingFingerprint)
    }

    private func writeSnapshot(to target: URL, expected: String?, pending: String?) throws -> FolioleBackupResult {
        var options = FolioleBackupOptions()
        options.timeoutMilliseconds = 30_000
        options.context = Unmanaged.passUnretained(self).toOpaque()
        options.snapshotPrepared = { context, fingerprint in
            guard let context, let fingerprint else { return SQLITE_MISUSE }
            let operation = Unmanaged<FolioleFolderBackupOperation>.fromOpaque(context).takeUnretainedValue()
            do {
                let value = String(cString: fingerprint)
                try operation.store.update(id: operation.profileID) {
                    if operation.stagingReplacement { $0.replacement?.fingerprint = value }
                    else { $0.pendingFingerprint = value }
                }
                operation.preparedFingerprint = value
                return SQLITE_OK
            } catch { operation.callbackError = error; return SQLITE_IOERR }
        }
        options.transactionCommitted = { context in
            guard let context else { return }
            let operation = Unmanaged<FolioleFolderBackupOperation>.fromOpaque(context).takeUnretainedValue()
            guard !operation.stagingReplacement else { return }
            do { try operation.recordCommit() }
            catch { operation.callbackError = error }
        }
        options.sourceReleased = { context in
            guard let context else { return }
            Unmanaged<FolioleFolderBackupOperation>.fromOpaque(context).takeUnretainedValue().sourceReleased()
        }
        let expected = expected.flatMap { strdup($0) }
        let pending = pending.flatMap { strdup($0) }
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

    private func recordCommit() throws {
        guard let preparedFingerprint else { throw backupError("Cannot retain the backup identity.") }
        try store.update(id: profileID) {
            $0.fingerprint = preparedFingerprint
            $0.pendingFingerprint = nil
            $0.savedAt = ISO8601DateFormatter().string(from: Date())
            $0.ownsTarget = true
            $0.targetCreationPending = false
        }
    }

    private func replacementOrigin(_ target: URL, profile: FolioleFolderBackupProfile) throws -> stat? {
        var info = stat()
        guard replaceExisting, !profile.ownsTarget, lstat(target.path, &info) == 0,
              info.st_mode & S_IFMT == S_IFREG, !(profile.targetCreationPending && info.st_size == 0) else {
            return nil
        }
        try requireDistinctSource(info)
        return info
    }

    private func replaceTarget(_ target: URL, original: stat) throws -> FolioleBackupResult {
        let replacement = FolioleFolderBackupReplacement(id: UUID(), originalDevice: original.st_dev, originalInode: original.st_ino)
        let staging = replacement.staging(in: target.deletingLastPathComponent())
        guard mkdir(staging.path, S_IRWXU) == 0 else { throw backupError("Cannot stage the replacement backup.") }
        do {
            try store.update(id: profileID) { $0.replacement = replacement }
            return try stageAndPublish(target, staging: staging, replacement: replacement)
        } catch {
            // If the original is still in place, undo any journal moves. Otherwise keep the
            // published identity and its recovery files for the next round.
            do {
                if let current = try FolioleFolderBackupDirectory.regularFile(target), replacement.containsOriginal(current) {
                    try FolioleFolderBackupDirectory.restoreReplacementJournals(target, from: staging)
                    try finishReplacement(staging)
                }
            } catch {
                throw backupError("Backup replacement was interrupted. Recovery files are in \(staging.lastPathComponent).")
            }
            throw error
        }
    }

    private func stageAndPublish(_ target: URL, staging: URL, replacement: FolioleFolderBackupReplacement) throws -> FolioleBackupResult {
        let candidate = staging.appendingPathComponent(target.lastPathComponent)
        try createTargetFile(candidate)
        stagingReplacement = true
        defer { stagingReplacement = false }
        let result = try writeSnapshot(to: candidate, expected: nil, pending: nil)
        guard result.committed == 1, result.cleanupPending == 0,
              let staged = try FolioleFolderBackupDirectory.regularFile(candidate), staged.st_size > 0 else {
            throw backupError("The replacement backup did not finish.")
        }
        try checkActive()
        guard let current = try FolioleFolderBackupDirectory.regularFile(target), replacement.containsOriginal(current) else {
            throw backupError("Backup destination changed during replacement.")
        }
        try FolioleFolderBackupDirectory.publishReplacement(candidate, to: target)
        try recordCommit()
        try finishReplacement(staging)
        return result
    }

    private func recoverReplacement(_ replacement: FolioleFolderBackupReplacement, at target: URL,
                                    profile: FolioleFolderBackupProfile) throws -> FolioleBackupResult? {
        let staging = replacement.staging(in: target.deletingLastPathComponent())
        if let current = try FolioleFolderBackupDirectory.regularFile(target), replacement.containsOriginal(current) {
            try FolioleFolderBackupDirectory.restoreReplacementJournals(target, from: staging)
            try finishReplacement(staging)
            return nil
        }
        // A moved candidate no longer exists at its staged name. Require the durable fingerprint
        // before opening the published file for another snapshot, even if it is now empty.
        let hasStaging = try FolioleFolderBackupDirectory.replacementStagingExists(staging)
        guard let current = try FolioleFolderBackupDirectory.regularFile(target),
              try !hasStaging || FolioleFolderBackupDirectory.regularFile(staging.appendingPathComponent(target.lastPathComponent)) == nil,
              let fingerprint = profile.fingerprint ?? replacement.fingerprint else {
            throw backupError("Cannot verify the interrupted backup replacement. Recovery files are in \(staging.lastPathComponent).")
        }
        try requireDistinctSource(current)
        let result = try writeSnapshot(to: target, expected: fingerprint, pending: profile.pendingFingerprint)
        if result.committed == 1, result.cleanupPending == 0 { try finishReplacement(staging) }
        return result
    }

    private func finishReplacement(_ staging: URL) throws {
        try FolioleFolderBackupDirectory.removeReplacementStaging(staging)
        try store.update(id: profileID) { $0.replacement = nil }
    }

    private func requireDistinctSource(_ target: stat) throws {
        var sourceInfo = stat()
        guard stat(source, &sourceInfo) == 0,
              target.st_dev != sourceInfo.st_dev || target.st_ino != sourceInfo.st_ino else {
            throw backupError("Backup destination is the active database.")
        }
    }

    func checkActive() throws {
        lock.lock(); defer { lock.unlock() }
        if cancelled { throw backupError("Backup cancelled.") }
    }

    private func prepareTarget(_ target: URL, profile: FolioleFolderBackupProfile) throws -> FolioleFolderBackupProfile {
        var info = stat()
        if lstat(target.path, &info) == 0 {
            guard info.st_mode & S_IFMT == S_IFREG,
                  profile.ownsTarget || (profile.targetCreationPending && info.st_size == 0) else {
                throw backupError("This folder already contains an unrecognized backup file. Choose another folder.")
            }
            if !profile.ownsTarget {
                try store.update(id: profile.id) { $0.ownsTarget = true; $0.targetCreationPending = false }
            }
            try requireDistinctSource(info)
            return profile
        }
        guard errno == ENOENT else { throw backupError("Backup file is missing or inaccessible.") }
        var current = profile
        if profile.ownsTarget {
            // The retained backup was removed from its folder. Nothing is left to protect, so forget its
            // identity first (an empty target may only be written without an expected fingerprint) and
            // create a new full backup in the same folder.
            func forget(_ value: inout FolioleFolderBackupProfile) {
                value.ownsTarget = false; value.fingerprint = nil; value.pendingFingerprint = nil; value.savedAt = nil
            }
            try store.update(id: profile.id, forget)
            forget(&current)
        }
        try store.update(id: profile.id) { $0.targetCreationPending = true }
        try createTargetFile(target)
        try store.update(id: profile.id) { $0.ownsTarget = true; $0.targetCreationPending = false }
        current.ownsTarget = true; current.targetCreationPending = false
        return current
    }

    private func createTargetFile(_ target: URL) throws {
        let descriptor = open(target.path, O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw backupError("Cannot create backup file.") }
        close(descriptor)
    }
}
