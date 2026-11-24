import Darwin
import Foundation
import SQLCipher

@main
struct BackupHostFixture {
    static func main() throws {
        let root = URL(fileURLWithPath: CommandLine.arguments[1])
        let source = root.appendingPathComponent("source.db").path
        let directory = root.appendingPathComponent("selected")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var database: OpaquePointer?
        precondition(sqlite3_open(source, &database) == SQLITE_OK)
        defer { sqlite3_close(database) }
        func sql(_ statement: String) { precondition(sqlite3_exec(database, statement, nil, nil, nil) == SQLITE_OK) }
        sql("PRAGMA journal_mode=WAL; CREATE TABLE facts(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO facts VALUES(1,'original'); CREATE TABLE payload(value BLOB); INSERT INTO payload VALUES(zeroblob(2000000));")
        let store = FolioleFolderBackupProfileStore(file: root.appendingPathComponent("private/profile.json"))
        try store.save(FolioleFolderBackupProfile(bookmark: directory.bookmarkData(options: .minimalBookmark), label: "selected"))
        func run(_ request: String) throws -> FolioleBackupResult {
            let profile = try store.load()!
            return try FolioleFolderBackupDirectory.access(profile) { selected in
                try FolioleFolderBackupOperation(requestID: request, epoch: "owner", source: source, store: store)
                    .run(directory: selected, profile: profile, filename: "Foliole.sqlite")
            }
        }
        let recoveryDirectory = root.appendingPathComponent("creation-recovery")
        try FileManager.default.createDirectory(at: recoveryDirectory, withIntermediateDirectories: true)
        let recoveryStore = FolioleFolderBackupProfileStore(file: root.appendingPathComponent("private/recovery.json"))
        var recoveryProfile = FolioleFolderBackupProfile(bookmark: Data(), label: "recovery")
        recoveryProfile.targetCreationPending = true
        try recoveryStore.save(recoveryProfile)
        try Data().write(to: recoveryDirectory.appendingPathComponent("Foliole.sqlite"))
        let recovered = try FolioleFolderBackupOperation(requestID: "recovered", epoch: "owner", source: source, store: recoveryStore)
            .run(directory: recoveryDirectory, profile: recoveryStore.load()!, filename: "Foliole.sqlite")
        precondition(recovered.committed == 1)
        let initial = try run("first")
        precondition(initial.committed == 1 && initial.pagesSent > 400)
        sql("UPDATE facts SET value='updated' WHERE id=1;")
        let delta = try run("second")
        precondition(delta.committed == 1 && delta.pagesSent < 10)
        let unchanged = try run("third")
        precondition(unchanged.committed == 1 && unchanged.pagesSent < 10)
        let persisted = try FolioleFolderBackupProfileStore(file: root.appendingPathComponent("private/profile.json")).load()!
        precondition(persisted.fingerprint != nil && persisted.pendingFingerprint == nil && persisted.savedAt != nil)
        // The user removes the backup file but keeps the folder: the next round writes a new full backup there.
        try FileManager.default.removeItem(at: directory.appendingPathComponent("Foliole.sqlite"))
        let recreated = try run("recreated")
        precondition(recreated.committed == 1 && recreated.pagesSent > 400, "removed backup was not recreated in full")
        let renewed = try store.load()!
        try interruptedReplacement(root: root, source: source, backup: directory.appendingPathComponent("Foliole.sqlite"),
                                   fingerprint: renewed.fingerprint!, published: true)
        try interruptedReplacement(root: root, source: source, backup: directory.appendingPathComponent("Foliole.sqlite"),
                                   fingerprint: renewed.fingerprint!, published: false)
        // A full re-copy (pagesSent above) proves the removed identity was forgotten; savedAt has one-second precision.
        precondition(renewed.ownsTarget && !renewed.targetCreationPending && renewed.fingerprint != nil && renewed.savedAt != nil,
                     "recreated backup has no identity of its own")
        // A library that does not own this folder's backup (e.g. after a restore) may replace it only when confirmed.
        let otherStore = FolioleFolderBackupProfileStore(file: root.appendingPathComponent("private/other.json"))
        try otherStore.save(FolioleFolderBackupProfile(bookmark: directory.bookmarkData(options: .minimalBookmark), label: "selected"))
        do {
            _ = try FolioleFolderBackupOperation(requestID: "other", epoch: "owner", source: source, store: otherStore)
                .run(directory: directory, profile: otherStore.load()!, filename: "Foliole.sqlite")
            preconditionFailure("wrote over a backup it does not own")
        } catch {}
        let target = directory.appendingPathComponent("Foliole.sqlite")
        let oldBytes = try Data(contentsOf: target)
        let oldJournal = URL(fileURLWithPath: target.path + "-journal")
        let journalBytes = Data([7])
        try journalBytes.write(to: oldJournal)
        let badSource = root.appendingPathComponent("invalid-source.sqlite")
        try Data("Not a database".utf8).write(to: badSource)
        do {
            _ = try FolioleFolderBackupOperation(requestID: "failed-replacement", epoch: "owner", source: badSource.path,
                store: otherStore, replaceExisting: true).run(directory: directory, profile: otherStore.load()!, filename: "Foliole.sqlite")
            preconditionFailure("replacement with an invalid source succeeded")
        } catch {}
        let retainedBytes = try Data(contentsOf: target)
        precondition(retainedBytes == oldBytes, "failed replacement lost the previous backup")
        let retainedJournal = try Data(contentsOf: oldJournal)
        precondition(retainedJournal == journalBytes, "failed replacement lost the previous journal")
        let failedProfile = try otherStore.load()!
        precondition(!failedProfile.ownsTarget && failedProfile.savedAt == nil, "failed replacement claimed the backup")
        let replaced = try FolioleFolderBackupOperation(requestID: "replace", epoch: "owner", source: source, store: otherStore,
            replaceExisting: true).run(directory: directory, profile: otherStore.load()!, filename: "Foliole.sqlite")
        let replacedProfile = try otherStore.load()!
        precondition(replaced.committed == 1 && replaced.pagesSent > 400 && replacedProfile.ownsTarget, "confirmed replacement failed")
        precondition(!FileManager.default.fileExists(atPath: oldJournal.path), "replacement retained the old journal")
        let cancelled = FolioleFolderBackupOperation(requestID: "cancel", epoch: "owner", source: source, store: store)
        var released = false
        cancelled.cancel { released = true }
        precondition(released)
        sql("UPDATE facts SET value='after-cancel' WHERE id=1;")
        do {
            _ = try cancelled.run(directory: directory, profile: store.load()!, filename: "Foliole.sqlite")
            preconditionFailure("cancelled operation succeeded")
        } catch {}
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let reset = root.appendingPathComponent("reset")
        let resetStore = FolioleFolderBackupProfileStore(file: reset.appendingPathComponent("folder-database-backup.json"))
        try resetStore.save(persisted)
        let setAside = reset.appendingPathComponent("restore-previous/database", isDirectory: true)
        try FileManager.default.createDirectory(at: setAside, withIntermediateDirectories: true)
        try Data([1]).write(to: setAside.appendingPathComponent("old.db"))
        try FolioleCompanionAppDataFiles.clear(support: reset, attachmentDirectory: "attachments", defaults: defaults)
        let cleared = try resetStore.load()
        precondition(cleared == nil)
        precondition(!FileManager.default.fileExists(atPath: reset.appendingPathComponent("restore-previous").path),
                     "clearing app data kept the set-aside library")
        precondition(FileManager.default.fileExists(atPath: directory.appendingPathComponent("Foliole.sqlite").path))
        print("{\"recreatedPages\":\(recreated.pagesSent),\"initialPages\":\(initial.pagesSent),\"changedPages\":\(delta.pagesSent),\"unchangedPages\":\(unchanged.pagesSent),\"target\":\"\(directory.path)/Foliole.sqlite\"}")
    }

    /// Seed the two on-disk states a new process can find on either side of the atomic rename.
    static func interruptedReplacement(root: URL, source: String, backup: URL, fingerprint: String, published: Bool) throws {
        let files = FileManager.default
        let directory = root.appendingPathComponent(published ? "published" : "interrupted")
        let target = directory.appendingPathComponent("Foliole.sqlite")
        let id = UUID()
        let stage = directory.appendingPathComponent(".foliole-backup-\(id.uuidString).partial")
        try files.createDirectory(at: stage, withIntermediateDirectories: true)
        try files.copyItem(at: backup, to: target)
        var prior = stat()
        precondition(lstat(target.path, &prior) == 0)
        let candidate = stage.appendingPathComponent(target.lastPathComponent)
        try files.copyItem(at: backup, to: candidate)
        try Data([7]).write(to: stage.appendingPathComponent("previous-journal"))
        if published { precondition(rename(candidate.path, target.path) == 0) }

        let settings = root.appendingPathComponent("private/\(directory.lastPathComponent).json")
        let store = FolioleFolderBackupProfileStore(file: settings)
        try store.save(FolioleFolderBackupProfile(bookmark: Data(), label: directory.lastPathComponent))
        // Use the durable profile file so the scenario can also run against the pre-fix worker.
        var profile = try JSONSerialization.jsonObject(with: Data(contentsOf: settings)) as! [String: Any]
        profile["replacement"] = ["id": id.uuidString, "originalDevice": prior.st_dev,
                                  "originalInode": prior.st_ino, "fingerprint": fingerprint]
        try JSONSerialization.data(withJSONObject: profile).write(to: settings)
        let operation = FolioleFolderBackupOperation(requestID: "retry", epoch: "owner", source: source, store: store)
        if published {
            let result = try operation.run(directory: directory, profile: store.load()!, filename: target.lastPathComponent)
            precondition(result.committed == 1 && result.pagesSent < 10, "did not resume the published replacement")
            let saved = try store.load()!
            precondition(saved.ownsTarget && saved.fingerprint != nil && saved.savedAt != nil)
        } else {
            do {
                _ = try operation.run(directory: directory, profile: store.load()!, filename: target.lastPathComponent)
                preconditionFailure("replaced the original without confirmation")
            } catch {}
            let journal = try Data(contentsOf: URL(fileURLWithPath: target.path + "-journal"))
            let contents = try Data(contentsOf: target)
            let oldContents = try Data(contentsOf: backup)
            precondition(journal == Data([7]) && contents == oldContents, "did not reunite the old backup and its journal")
        }
        precondition(!files.fileExists(atPath: stage.path), "interrupted replacement files were left behind")
    }

}
