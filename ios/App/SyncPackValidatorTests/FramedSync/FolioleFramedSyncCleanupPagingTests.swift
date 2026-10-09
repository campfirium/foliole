import CryptoKit
import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncCleanupPagingTests: XCTestCase {
    private let transferID = Data(repeating: 1, count: 32)

    func testCleanupAfterAnotherConnectionRecoversTheCommittedReceiptIsIdempotent() throws {
        try withDatabase { database in
            try database.execute("INSERT INTO framed_sync_ios_receipts VALUES (?, ?, ?, ?, ?)",
                                 [transferID, Data(repeating: 2, count: 32), "receiver", "epoch", Data(repeating: 3, count: 32)])
            _ = try insert(database, id: 1, type: 3, plaintext: Data("Committed fact".utf8))
            let recovered = try FolioleFramedSyncTransferDatabase(url: database.url)
            XCTAssertTrue(try recovered.rows("SELECT 1 FROM framed_sync_ios_receipts").isEmpty)
            try FolioleFramedSyncCompletedInboundCleanup.retire(database: database, transferID: transferID)
            XCTAssertTrue(try database.rows("SELECT 1 FROM framed_sync_ios_frames").isEmpty)
        }
    }

    func testMissingReceiptStillProtectsPendingFacts() throws {
        try withDatabase { database in
            let original = Data("Pending fact".utf8)
            _ = try insert(database, id: 1, type: 3, plaintext: original)
            XCTAssertThrowsError(try FolioleFramedSyncCompletedInboundCleanup.retire(database: database, transferID: transferID))
            XCTAssertEqual(try database.rows("SELECT authenticated_plaintext FROM framed_sync_ios_frames").first?[0] as? Data, original)
        }
    }

    private func withDatabase(_ operation: (FolioleFramedSyncTransferDatabase) throws -> Void) throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-cleanup-paging-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        try operation(FolioleFramedSyncTransferDatabase(url: root.appendingPathComponent("stage.db")))
    }

    private func insert(_ database: FolioleFramedSyncTransferDatabase, id: Int, type: Int,
                        plaintext: Data, transfer: Data? = nil) throws -> Data {
        let ciphertext = Data(repeating: UInt8(truncatingIfNeeded: id), count: plaintext.count + 16)
        try database.execute("""
            INSERT INTO framed_sync_ios_frames
              (rowid, transfer_id, attempt_id, sequence, frame_type, preamble, frame_header,
               ciphertext, authenticated_plaintext) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [id, transfer ?? transferID, Data(repeating: 2, count: 16), String(id), type,
                  Data([3]), Data([4]), ciphertext, plaintext])
        return ciphertext
    }

    func testReadyCleanupHashesEveryBodyFrameAndPreservesOtherTransfersFactsAndHeaders() throws {
        try withDatabase { database in
            let bodies = [-3, 0, 5].map { Data(repeating: UInt8(truncatingIfNeeded: $0), count: 512 * 1024) }
            for (id, body) in zip([-3, 0, 5], bodies) {
                _ = try insert(database, id: id, type: 4, plaintext: body)
            }
            let metadata = Data("Original metadata".utf8)
            for (id, type) in [(9, 2), (11, 3)] {
                _ = try insert(database, id: id, type: type, plaintext: metadata)
            }
            let existingDigest = Data(repeating: 8, count: 32)
            _ = try insert(database, id: 13, type: 4, plaintext: existingDigest)
            let foreignBody = Data(repeating: 9, count: 64)
            _ = try insert(database, id: 15, type: 4, plaintext: foreignBody, transfer: Data(repeating: 7, count: 32))
            let before = try database.rows("SELECT rowid, ciphertext FROM framed_sync_ios_frames ORDER BY rowid")
            try database.transaction {
                try FolioleFramedSyncCompletedInboundCleanup.retireReadyCopies(database: database, transferID: transferID)
            }
            for (id, body) in zip([-3, 0, 5], bodies) {
                XCTAssertEqual(try database.rows("SELECT authenticated_plaintext FROM framed_sync_ios_frames WHERE rowid = ?", [id]).first?[0] as? Data,
                               Data(SHA256.hash(data: body)))
            }
            for id in [9, 11] {
                XCTAssertEqual(try database.rows("SELECT authenticated_plaintext FROM framed_sync_ios_frames WHERE rowid = ?", [id]).first?[0] as? Data, metadata)
            }
            XCTAssertEqual(try database.rows("SELECT authenticated_plaintext FROM framed_sync_ios_frames WHERE rowid = 13").first?[0] as? Data, existingDigest)
            XCTAssertEqual(try database.rows("SELECT authenticated_plaintext FROM framed_sync_ios_frames WHERE rowid = 15").first?[0] as? Data, foreignBody)
            let after = try database.rows("SELECT rowid, ciphertext FROM framed_sync_ios_frames ORDER BY rowid")
            XCTAssertEqual(after.compactMap { $0[1] as? Data }, before.compactMap { $0[1] as? Data })
        }
    }

    func testMigrationHashesEveryEligibleCiphertextAndKeepsTheVersionGateAndAlreadyDigestedBodies() throws {
        try withDatabase { database in
            let ids = [-3, 0, 5, 9]
            let types = [2, 3, 4, 4]
            let plaintexts = [Data("Header".utf8), Data("Fact".utf8), Data(repeating: 7, count: 512 * 1024), Data(repeating: 8, count: 32)]
            var ciphertexts = [Data]()
            for index in ids.indices {
                ciphertexts.append(try insert(database, id: ids[index], type: types[index], plaintext: plaintexts[index]))
            }
            try database.execute("PRAGMA user_version = 0")
            try FolioleFramedSyncCompletedInboundCleanup.migratePayloads(database: database)
            for index in ids.indices {
                let row = try database.rows("SELECT ciphertext, authenticated_plaintext FROM framed_sync_ios_frames WHERE rowid = ?", [ids[index]]).first
                let expected = index == 3 ? ciphertexts[index] : Data(SHA256.hash(data: ciphertexts[index]))
                XCTAssertEqual(row?[0] as? Data, expected)
                XCTAssertEqual(row?[1] as? Data, plaintexts[index])
            }
            XCTAssertEqual(try database.rows("PRAGMA user_version").first?[0] as? Int, 1)
            let before = try database.rows("SELECT ciphertext FROM framed_sync_ios_frames ORDER BY rowid").compactMap { $0[0] as? Data }
            try FolioleFramedSyncCompletedInboundCleanup.migratePayloads(database: database)
            XCTAssertEqual(try database.rows("SELECT ciphertext FROM framed_sync_ios_frames ORDER BY rowid").compactMap { $0[0] as? Data }, before)
        }
    }
}
