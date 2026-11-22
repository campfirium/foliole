import Foundation
import XCTest
@testable import FolioleSyncPackValidator

/// Swaps real files on disk; interruptions come from a directory the swap cannot write,
/// after which a fresh swap (as on the next app start) must finish the job.
final class FolioleBackupRestoreSwapTests: XCTestCase {
    private var root: URL!
    private var databases: URL { root.appendingPathComponent("CapacitorDatabase") }
    private var support: URL { root.appendingPathComponent("Application Support") }
    private var stagingRoot: URL { support.appendingPathComponent("restore-staging") }
    private var database: URL { databases.appendingPathComponent("foliole-companionSQLite.db") }
    private var staged: URL { databases.appendingPathComponent("foliole-restore-stagingSQLite.db") }

    override func setUpWithError() throws {
        root = URL(fileURLWithPath: ProcessInfo.processInfo.environment["TMPDIR"] ?? NSTemporaryDirectory()).appendingPathComponent("restore-swap-" + UUID().uuidString)
        try write("current", database)
        try write("current-wal", URL(fileURLWithPath: database.path + "-wal"))
        try write("current-file", support.appendingPathComponent("attachments/current.png"))
        try write("current-trash", support.appendingPathComponent("attachments.trash/old.png"))
        try write("{\"current\":true}", support.appendingPathComponent("folder-database-backup.json"))
        try write("unrelated", support.appendingPathComponent("SyncRequests/keep"))
    }

    override func tearDownWithError() throws {
        for path in [databases, stagingRoot] { chmod(path.path, 0o755) }
        try? FileManager.default.removeItem(at: root)
    }

    func testCommitInstallsCandidateAndKeepsThePreviousLibrary() throws {
        try stageCandidate()
        let swap = makeSwap()
        try swap.commit("2026-11-22T10:00:00Z")
        XCTAssertEqual(try text(database), "candidate")
        XCTAssertFalse(exists(database.path + "-wal"))
        XCTAssertEqual(try text(support.appendingPathComponent("attachments/new.png")), "candidate-file")
        XCTAssertFalse(exists(support.appendingPathComponent("attachments/current.png").path))
        XCTAssertTrue(isDirectory(support.appendingPathComponent("attachments.trash")))
        XCTAssertFalse(exists(support.appendingPathComponent("folder-database-backup.json").path))
        XCTAssertEqual(try text(support.appendingPathComponent("SyncRequests/keep")), "unrelated")
        XCTAssertFalse(exists(stagingRoot.path))
        XCTAssertFalse(swap.interrupted)
        XCTAssertEqual(try swap.previousSavedAt(), "2026-11-22T10:00:00Z")
        let previous = support.appendingPathComponent("restore-previous")
        XCTAssertEqual(try text(previous.appendingPathComponent("database/foliole-companionSQLite.db")), "current")
        XCTAssertEqual(try text(previous.appendingPathComponent("database/foliole-companionSQLite.db-wal")), "current-wal")
        XCTAssertEqual(try text(previous.appendingPathComponent("attachments/current.png")), "current-file")
    }

    func testRevertPutsThePreviousLibraryBackAndKeepsTheReplacedOne() throws {
        try stageCandidate()
        try makeSwap().commit("first")
        try makeSwap().revert("second")
        XCTAssertEqual(try text(database), "current")
        XCTAssertEqual(try text(URL(fileURLWithPath: database.path + "-wal")), "current-wal")
        XCTAssertEqual(try text(support.appendingPathComponent("attachments/current.png")), "current-file")
        XCTAssertEqual(try text(support.appendingPathComponent("folder-database-backup.json")), "{\"current\":true}")
        XCTAssertEqual(try makeSwap().previousSavedAt(), "second")
        let previous = support.appendingPathComponent("restore-previous")
        XCTAssertEqual(try text(previous.appendingPathComponent("database/foliole-companionSQLite.db")), "candidate")
        try makeSwap().revert("third")
        XCTAssertEqual(try text(database), "candidate")
    }

    func testNothingStagedAndNoPreviousAreRejected() throws {
        XCTAssertThrowsError(try makeSwap().commit("now")) {
            XCTAssertEqual(($0 as NSError).localizedDescription, "restore_nothing_staged")
        }
        XCTAssertThrowsError(try makeSwap().revert("now")) {
            XCTAssertEqual(($0 as NSError).localizedDescription, "restore_no_previous")
        }
        XCTAssertEqual(try text(database), "current")
    }

    func testSwapInterruptedWhileMovingTheLibraryOutFinishesOnNextStart() throws {
        try stageCandidate()
        chmod(databases.path, 0o555)
        XCTAssertThrowsError(try makeSwap().commit("now"))
        chmod(databases.path, 0o755)
        let restarted = makeSwap()
        XCTAssertTrue(restarted.interrupted)
        try restarted.commit("later")
        XCTAssertEqual(try text(database), "candidate")
        XCTAssertEqual(try text(support.appendingPathComponent("attachments/new.png")), "candidate-file")
        XCTAssertEqual(try text(support.appendingPathComponent("restore-previous/database/foliole-companionSQLite.db")), "current")
        XCTAssertFalse(restarted.interrupted)
    }

    func testSwapInterruptedWhileInstallingFinishesOnNextStart() throws {
        try stageCandidate()
        chmod(stagingRoot.path, 0o555)
        XCTAssertThrowsError(try makeSwap().commit("now"))
        XCTAssertEqual(try text(database), "candidate")
        XCTAssertFalse(exists(support.appendingPathComponent("attachments").path))
        chmod(stagingRoot.path, 0o755)
        try makeSwap().commit("later")
        XCTAssertEqual(try text(support.appendingPathComponent("attachments/new.png")), "candidate-file")
        XCTAssertEqual(try text(support.appendingPathComponent("restore-previous/attachments/current.png")), "current-file")
        XCTAssertFalse(exists(stagingRoot.path))
        XCTAssertFalse(makeSwap().interrupted)
    }

    func testInterruptedRevertFinishesOnNextStart() throws {
        try stageCandidate()
        try makeSwap().commit("first")
        chmod(databases.path, 0o555)
        XCTAssertThrowsError(try makeSwap().revert("second"))
        chmod(databases.path, 0o755)
        try makeSwap().commit("second")
        XCTAssertEqual(try text(database), "current")
        XCTAssertEqual(try text(support.appendingPathComponent("restore-previous/database/foliole-companionSQLite.db")), "candidate")
    }

    private func stageCandidate() throws {
        try write("candidate", staged)
        try write("candidate-file", stagingRoot.appendingPathComponent("attachments/new.png"))
    }

    private func makeSwap() -> FolioleBackupRestoreSwap {
        FolioleBackupRestoreSwap(database: database, stagedDatabase: staged, files: support, stagingRoot: stagingRoot,
                                 attachmentDirectory: "attachments")
    }

    private func write(_ value: String, _ url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: url.path, contents: Data(value.utf8))
    }

    private func text(_ url: URL) throws -> String { try String(contentsOf: url, encoding: .utf8) }
    private func exists(_ path: String) -> Bool { FileManager.default.fileExists(atPath: path) }
    private func isDirectory(_ url: URL) -> Bool {
        var directory: ObjCBool = false
        return FileManager.default.fileExists(atPath: url.path, isDirectory: &directory) && directory.boolValue
    }
}
