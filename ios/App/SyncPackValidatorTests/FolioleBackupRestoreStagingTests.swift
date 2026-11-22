import CryptoKit
import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleBackupRestoreStagingTests: XCTestCase {
    private var root: URL!
    private let databaseName = "Foliole.sqlite"
    private let database = Data("SQLite format 3\0".utf8) + Data(repeating: 7, count: 300_000)
    private let attachment = Data(repeating: 9, count: 120_000)

    override func setUpWithError() throws {
        root = URL(fileURLWithPath: ProcessInfo.processInfo.environment["TMPDIR"] ?? NSTemporaryDirectory()).appendingPathComponent("restore-staging-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws { try? FileManager.default.removeItem(at: root) }

    func testDeflatedZipInOneFolderStagesVerifiedFilesOnly() throws {
        let backup = try backupFolder(in: "zip-source/Foliole backup")
        try write(Data("bad".utf8), backup.appendingPathComponent("Attachments/\(String(repeating: "a", count: 64)).png"))
        try write(Data("x".utf8), backup.appendingPathComponent("Attachments/readme.txt"))
        try write(Data(), backup.appendingPathComponent(databaseName + "-journal"))
        let zip = try zipped(root.appendingPathComponent("zip-source"), ["-r", "-X"])
        let staging = try stage { try FolioleBackupRestoreSources.readZip(zip, databaseName: databaseName, staging: $0) }
        XCTAssertEqual(try Data(contentsOf: staging.database), database)
        XCTAssertEqual(staging.stagedKeys, [key(attachment)])
        XCTAssertEqual(try Data(contentsOf: staging.attachments.appendingPathComponent(key(attachment))), attachment)
        XCTAssertEqual(staging.damagedFiles, 1)
        XCTAssertEqual(staging.skippedFiles, 1)
    }

    func testStoredZip64AtRootStagesTheDatabase() throws {
        let backup = try backupFolder(in: "root-source")
        let zip = try zipped(backup, ["-r", "-0", "-fz"])
        let staging = try stage { try FolioleBackupRestoreSources.readZip(zip, databaseName: databaseName, staging: $0) }
        XCTAssertEqual(try Data(contentsOf: staging.database), database)
        XCTAssertEqual(staging.stagedKeys, [key(attachment)])
    }

    func testCorruptedZipEntryIsNotAnArchive() throws {
        let backup = try backupFolder(in: "corrupt-source")
        let zip = try zipped(backup, ["-r", "-0"])
        var bytes = try Data(contentsOf: zip)
        let at = bytes.range(of: Data(repeating: 7, count: 64))!.lowerBound
        bytes[at] = 8
        try bytes.write(to: zip)
        XCTAssertThrowsError(try stage { try FolioleBackupRestoreSources.readZip(zip, databaseName: databaseName, staging: $0) }) {
            XCTAssertEqual(($0 as NSError).localizedDescription, "restore_not_archive")
        }
    }

    func testRejectedArchives() throws {
        let two = try backupFolder(in: "two/inner")
        try write(database, root.appendingPathComponent("two/" + databaseName))
        _ = two
        try expectZip(root.appendingPathComponent("two"), "restore_multiple_backups")
        let incomplete = try backupFolder(in: "incomplete")
        try write(Data("pending".utf8), incomplete.appendingPathComponent(databaseName + "-wal"))
        try expectZip(incomplete, "restore_backup_incomplete")
        let foreign = root.appendingPathComponent("foreign")
        try write(Data("not a database at all".utf8), foreign.appendingPathComponent(databaseName))
        try expectZip(foreign, "restore_not_database")
        let empty = root.appendingPathComponent("empty")
        try write(attachment, empty.appendingPathComponent("Attachments/" + key(attachment)))
        try expectZip(empty, "restore_not_backup")
        let text = root.appendingPathComponent("plain.zip")
        try write(Data(repeating: 1, count: 200), text)
        XCTAssertThrowsError(try stage { try FolioleBackupRestoreSources.readZip(text, databaseName: databaseName, staging: $0) }) {
            XCTAssertEqual(($0 as NSError).localizedDescription, "restore_not_archive")
        }
    }

    func testUnsafeAndForeignEntryNames() throws {
        let layout = FolioleBackupRestoreArchiveLayout(databaseName: databaseName)
        for name in ["../Foliole.sqlite", "/Foliole.sqlite", "C:/Foliole.sqlite", "a//Foliole.sqlite"] {
            XCTAssertThrowsError(try layout.classify(name)) {
                XCTAssertEqual(($0 as NSError).localizedDescription, "restore_unsafe_archive")
            }
        }
        XCTAssertEqual(try layout.classify("__MACOSX/b/Foliole.sqlite").kind, .ignored)
        XCTAssertEqual(try layout.classify("b/._Foliole.sqlite").kind, .ignored)
        XCTAssertEqual(try layout.classify("b/c/d/Foliole.sqlite").kind, .ignored)
        XCTAssertEqual(try layout.classify("b/Attachments/x.png").kind, .attachment)
    }

    func testFolderBackupStagesAndRejectsUnfinishedJournal() throws {
        let backup = try backupFolder(in: "folder")
        let staging = try stage { try FolioleBackupRestoreSources.readFolder(backup, databaseName: databaseName, staging: $0) }
        XCTAssertEqual(try Data(contentsOf: staging.database), database)
        XCTAssertEqual(staging.stagedKeys, [key(attachment)])
        try write(Data("pending".utf8), backup.appendingPathComponent(databaseName + "-journal"))
        XCTAssertThrowsError(try stage { try FolioleBackupRestoreSources.readFolder(backup, databaseName: databaseName, staging: $0) }) {
            XCTAssertEqual(($0 as NSError).localizedDescription, "restore_backup_incomplete")
        }
    }

    func testCancellationStopsCopying() throws {
        let backup = try backupFolder(in: "cancel")
        let staging = FolioleBackupRestoreStaging(database: root.appendingPathComponent("db/staged.db"),
                                                  attachments: root.appendingPathComponent("staging/attachments"),
                                                  cancelled: { true })
        try staging.reset()
        XCTAssertThrowsError(try FolioleBackupRestoreSources.readFolder(backup, databaseName: databaseName, staging: staging)) {
            XCTAssertTrue($0 is FolioleRestoreCancelled)
        }
    }

    private func stage(_ read: (FolioleBackupRestoreStaging) throws -> Void) throws -> FolioleBackupRestoreStaging {
        let staging = FolioleBackupRestoreStaging(database: root.appendingPathComponent("db/staged.db"),
                                                  attachments: root.appendingPathComponent("staging/attachments"))
        try staging.reset()
        try read(staging)
        return staging
    }

    private func expectZip(_ folder: URL, _ code: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let zip = try zipped(folder, ["-r"])
        XCTAssertThrowsError(try stage { try FolioleBackupRestoreSources.readZip(zip, databaseName: databaseName, staging: $0) },
                             file: file, line: line) {
            XCTAssertEqual(($0 as NSError).localizedDescription, code, file: file, line: line)
        }
    }

    private func backupFolder(in path: String) throws -> URL {
        let folder = root.appendingPathComponent(path)
        try write(database, folder.appendingPathComponent(databaseName))
        try write(attachment, folder.appendingPathComponent("Attachments/" + key(attachment)))
        return folder
    }

    private func zipped(_ folder: URL, _ options: [String]) throws -> URL {
        let zip = root.appendingPathComponent(UUID().uuidString + ".zip")
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/zip")
        process.currentDirectoryURL = folder
        process.arguments = ["-q"] + options + [zip.path, "."]
        try process.run()
        process.waitUntilExit()
        XCTAssertEqual(process.terminationStatus, 0)
        return zip
    }

    private func key(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() + ".png" }

    private func write(_ data: Data, _ url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: url.path, contents: data)
    }
}
