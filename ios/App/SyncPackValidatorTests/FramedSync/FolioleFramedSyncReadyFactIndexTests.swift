import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncReadyFactIndexTests: XCTestCase {
    private let transferID = Data(repeating: 1, count: 32)
    private let attemptID = Data(repeating: 2, count: 16)

    func testReadsCanonicalOrderFromDurableFramesAndRetriesAfterMissingFrame() throws {
        try FramedSyncWholeBodyReceiverFixture.withRoot { root in
            let database = try FramedSyncWholeBodyReceiverFixture.database(root)
            let index = FolioleFramedSyncReadyFactIndex()
            let first = fact("version-z"), second = fact("version-a")
            try index.append(first, sequence: 9); try index.append(second, sequence: 10)
            try insert(first, sequence: "9", database: database)
            try insert(second, sequence: "10", database: database)
            let expected = try FolioleFramedSyncCanonicalManifest.contentID(facts: [first, second], blobs: [])
            XCTAssertEqual(try index.contentID(database: database, transferID: transferID,
                attemptID: attemptID, blobs: []), expected)
            try database.execute("DELETE FROM framed_sync_ios_frames WHERE sequence = '10'")
            XCTAssertThrowsError(try index.contentID(database: database, transferID: transferID,
                attemptID: attemptID, blobs: [])) { error in
                XCTAssertEqual((error as? FolioleFramedSyncValidationError)?.code, "canonical_fact_source_changed")
            }
            try insert(second, sequence: "10", database: database)
            XCTAssertEqual(try index.contentID(database: database, transferID: transferID,
                attemptID: attemptID, blobs: []), expected)
            XCTAssertEqual(try database.rows("SELECT sequence FROM framed_sync_ios_frames ORDER BY sequence").count, 2)
        }
    }

    func testRejectsDuplicateIdentityAndOversizedStoredFrameWithoutAcceptingItsDigest() throws {
        try FramedSyncWholeBodyReceiverFixture.withRoot { root in
            let database = try FramedSyncWholeBodyReceiverFixture.database(root)
            let index = FolioleFramedSyncReadyFactIndex(), value = fact("version-1")
            try index.append(value, sequence: 0)
            XCTAssertThrowsError(try index.append(value, sequence: 1)) { error in
                XCTAssertEqual((error as? FolioleFramedSyncValidationError)?.code, "inbound_fact_identity_conflict")
            }
            XCTAssertEqual(index.count, 1)
            try insert(value, sequence: "0", database: database)
            try database.execute("UPDATE framed_sync_ios_frames SET authenticated_plaintext = zeroblob(?)",
                [FolioleFramedSyncLimits.maxFrameMessageBytes + 1])
            XCTAssertThrowsError(try index.contentID(database: database, transferID: transferID,
                attemptID: attemptID, blobs: []))
            XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_frames").count, 1)
        }
    }

    private func fact(_ id: String) -> Foliole_Sync_V22_FactRecord {
        var value = Foliole_Sync_V22_FactRecord()
        value.identity.kind = .nodeVersion; value.identity.objectType = "node"
        value.identity.globalID = "node-1"; value.identity.factID = id
        value.sharedStateHash = Data(repeating: 7, count: 32)
        value.body = .init()
        return value
    }

    private func insert(_ fact: Foliole_Sync_V22_FactRecord, sequence: String,
                        database: FolioleFramedSyncTransferDatabase) throws {
        var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .fact(fact)
        let bytes = try FolioleFramedSyncCodec.encode(
            FolioleFramedSyncCodec.validateOutbound(message, authenticatedFrameType: 3))
        try database.execute("INSERT INTO framed_sync_ios_frames VALUES (?, ?, ?, 3, ?, ?, ?, ?)",
            [transferID, attemptID, sequence, Data(repeating: 0, count: 96), Data(repeating: 0, count: 16), Data([1]), bytes])
    }
}
