import CryptoKit
import Foundation
import XCTest
import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncAvailableBodyMigrationTests: XCTestCase {
    func testPreservesMultiplePinsEmptyAndLargeBinaryBodies() throws {
        try withDatabase { database in
            let body = Data((0..<(3 * 1024 * 1024 + 17)).map { UInt8($0 % 256) })
            let reference = try insert(body, database: database)
            let empty = try insert(Data(), database: database)
            try database.execute("INSERT INTO framed_sync_ios_blob_pins VALUES (?, ?, ?, 1, 1)",
                                 [Data(repeating: 1, count: 32), reference.sha256, reference.byteLength])
            try database.execute("INSERT INTO framed_sync_ios_blob_pins VALUES (?, ?, ?, 5, 0)",
                                 [Data(repeating: 2, count: 32), reference.sha256, reference.byteLength])
            let pins = try pinRows(database)
            try FolioleFramedSyncAvailableBodyMigration.migrateChunkedAvailableBodies(database: database)
            XCTAssertEqual(try pinRows(database), pins)
            XCTAssertEqual(try version(database), 2)
            XCTAssertEqual(try names(database, pattern: "%continuous_upgrade%"), [])
            XCTAssertEqual(try database.rows("PRAGMA foreign_key_list(framed_sync_ios_blob_pins)").count, 0)
            let verifier = FolioleFramedSyncChunkedBodies(database: database, transferID: Data(), attemptID: Data())
            XCTAssertTrue(try verifier.verifyAndPromote(reference))
            XCTAssertTrue(try verifier.verifyAndPromote(empty))
            XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_available_blob_chunks WHERE sha256 = ?",
                                           [empty.sha256]).count, 0)
            let rows = try database.rows("SELECT byte_offset, data FROM framed_sync_ios_available_blob_chunks ORDER BY byte_offset")
            XCTAssertEqual(rows.count, (body.count + 524_287) / 524_288)
            for row in rows {
                let offset = try XCTUnwrap(row[0] as? Int)
                let data = try XCTUnwrap(row[1] as? Data)
                XCTAssertLessThanOrEqual(data.count, 524_288)
                XCTAssertEqual(data, body.subdata(in: offset..<min(offset + 524_288, body.count)))
            }
            try database.execute("DELETE FROM framed_sync_ios_available_blobs WHERE sha256 = ?", [reference.sha256])
            XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_available_blob_chunks").count, 0)
            XCTAssertEqual(try pinRows(database), pins)
        }
    }

    func testLaterBadRawHashRollsBackAllDataPinsSchemaAndVersion() throws {
        try withDatabase { database in
            let first = try insert(Data(repeating: 255, count: 524_289), database: database)
            let second = try insert(Data([1, 2, 3]), database: database)
            try database.execute("INSERT INTO framed_sync_ios_blob_pins VALUES (?, ?, ?, 1, 1)",
                                 [Data(repeating: 1, count: 32), first.sha256, first.byteLength])
            try database.execute("INSERT INTO framed_sync_ios_blob_pins VALUES (?, ?, ?, 5, 0)",
                                 [Data(repeating: 2, count: 32), second.sha256, second.byteLength])
            try database.execute("UPDATE framed_sync_ios_available_blobs SET data = ? WHERE sha256 = ?",
                                 [Data([1, 2, 4]), second.sha256])
            let pins = try pinRows(database)
            XCTAssertThrowsError(try FolioleFramedSyncAvailableBodyMigration.migrateChunkedAvailableBodies(database: database))
            XCTAssertEqual(try version(database), 1)
            XCTAssertEqual(try pinRows(database), pins)
            XCTAssertEqual(try names(database, pattern: "%continuous_upgrade%"), [])
            XCTAssertEqual(try names(database, pattern: "framed_sync_ios_available_blob_chunks"), [])
            XCTAssertEqual(try database.rows("SELECT data FROM framed_sync_ios_available_blobs WHERE sha256 = ?",
                                           [first.sha256]).first?[0] as? Data, Data(repeating: 255, count: 524_289))
            XCTAssertEqual(try database.rows("SELECT data FROM framed_sync_ios_available_blobs WHERE sha256 = ?",
                                           [second.sha256]).first?[0] as? Data, Data([1, 2, 4]))
            try database.execute("UPDATE framed_sync_ios_available_blobs SET data = ? WHERE sha256 = ?",
                                 [Data([1, 2, 3]), second.sha256])
            try FolioleFramedSyncAvailableBodyMigration.migrateChunkedAvailableBodies(database: database)
            XCTAssertEqual(try version(database), 2)
        }
    }

    func testVersionTwoReopenDoesNotRemigrateHeadersOrChunks() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let url = root.appendingPathComponent("staging.db")
        do {
            let database = try FolioleFramedSyncTransferDatabase(url: url)
            _ = try insert(Data([0, 255, 128]), database: database)
            try FolioleFramedSyncAvailableBodyMigration.migrateChunkedAvailableBodies(database: database)
        }
        let reopened = try FolioleFramedSyncTransferDatabase(url: url)
        let before = try XCTUnwrap(reopened.rows("SELECT data FROM framed_sync_ios_available_blob_chunks").first?[0] as? Data)
        XCTAssertEqual(before, Data([0, 255, 128]))
        try FolioleFramedSyncAvailableBodyMigration.migrateChunkedAvailableBodies(database: reopened)
        XCTAssertEqual(try version(reopened), 2)
        XCTAssertEqual(try reopened.rows("SELECT data FROM framed_sync_ios_available_blob_chunks").first?[0] as? Data, before)
        XCTAssertEqual(try names(reopened, pattern: "%continuous_upgrade%"), [])
    }

    func testVersionZeroRequiresOriginalDigestMigrationBeforeAnySchemaChange() throws {
        try withDatabase { database in
            try database.execute("PRAGMA user_version = 0")
            XCTAssertThrowsError(try FolioleFramedSyncAvailableBodyMigration.migrateChunkedAvailableBodies(database: database)) { error in
                XCTAssertEqual((error as? FolioleFramedSyncValidationError)?.code, "framed_sync_digest_migration_required")
            }
            XCTAssertEqual(try version(database), 0)
            XCTAssertEqual(try names(database, pattern: "%continuous_upgrade%"), [])
            XCTAssertEqual(try names(database, pattern: "framed_sync_ios_available_blob_chunks"), [])
        }
    }

    private func insert(_ bytes: Data, database: FolioleFramedSyncTransferDatabase) throws -> Foliole_Sync_V22_BlobReference {
        var reference = Foliole_Sync_V22_BlobReference()
        reference.sha256 = Data(SHA256.hash(data: bytes))
        reference.byteLength = UInt64(bytes.count)
        if bytes.isEmpty {
            try database.execute("INSERT INTO framed_sync_ios_available_blobs VALUES (?, ?, zeroblob(0))",
                                 [reference.sha256, reference.byteLength])
        } else {
            try database.execute("INSERT INTO framed_sync_ios_available_blobs VALUES (?, ?, ?)",
                                 [reference.sha256, reference.byteLength, bytes])
        }
        return reference
    }

    private func pinRows(_ database: FolioleFramedSyncTransferDatabase) throws -> [String] {
        try database.rows("SELECT hex(transfer_id), hex(sha256), byte_length, role, required FROM framed_sync_ios_blob_pins ORDER BY transfer_id")
            .map { $0.map { value in value.map { String(describing: $0) } ?? "NULL" }.joined(separator: ":") }
    }

    private func version(_ database: FolioleFramedSyncTransferDatabase) throws -> Int? {
        try database.rows("PRAGMA user_version").first?[0] as? Int
    }

    private func names(_ database: FolioleFramedSyncTransferDatabase, pattern: String) throws -> [String] {
        try database.rows("SELECT name FROM sqlite_master WHERE name LIKE ? ORDER BY name", [pattern]).compactMap { $0[0] as? String }
    }

    private func temporaryRoot() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("framed-upgrade-\(UUID().uuidString)")
    }

    private func withDatabase(_ operation: (FolioleFramedSyncTransferDatabase) throws -> Void) throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        try operation(FolioleFramedSyncTransferDatabase(url: root.appendingPathComponent("staging.db")))
    }
}
