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
        try FolioleCompanionAppDataFiles.clear(support: reset, attachmentDirectory: "attachments", defaults: defaults)
        let cleared = try resetStore.load()
        precondition(cleared == nil)
        precondition(FileManager.default.fileExists(atPath: directory.appendingPathComponent("Foliole.sqlite").path))
        print("{\"initialPages\":\(initial.pagesSent),\"changedPages\":\(delta.pagesSent),\"unchangedPages\":\(unchanged.pagesSent),\"target\":\"\(directory.path)/Foliole.sqlite\"}")
    }
}
