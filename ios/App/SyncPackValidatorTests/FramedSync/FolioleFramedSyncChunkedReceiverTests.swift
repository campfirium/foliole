import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncChunkedReceiverTests: XCTestCase {
    private typealias Fixture = FramedSyncChunkedReceiverFixture

    func testAuthenticatedEmptyAndLargeBodiesForBothBodyRoles() throws {
        let large = Fixture.largeBody()
        XCTAssertGreaterThan(large.count, 3 * 1024 * 1024)
        let roles: [Foliole_Sync_V22_BlobRole] = [.nodeBody, .externalDocument]
        for role in roles {
            for body in [Data(), large] {
                try Fixture.withRoot { root in
                    let database = try Fixture.database(root)
                    let publication = try Fixture.publication(root, body: body, role: role)
                    try Fixture.receive(publication, database: database, root: root)
                    try Fixture.assertBody(body, publication: publication, database: database)
                    XCTAssertEqual(try database.rows("SELECT state FROM framed_sync_ios_transfers")
                        .first?[0] as? String, "ready_to_apply")
                    XCTAssertTrue(try database.rows("SELECT 1 FROM framed_sync_ios_resource_pins").isEmpty)
                    XCTAssertTrue(try database.rows("""
                        SELECT 1 FROM framed_sync_ios_frames
                        WHERE frame_type = 4 AND length(authenticated_plaintext) != 32
                        """).isEmpty)
                    XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_frames WHERE frame_type IN (2, 3)").count, 2)
                }
            }
        }
    }

    func testChunkInsertFailureRollsBackReadyButAuthenticatedPublicationCanRetry() throws {
        try Fixture.withRoot { root in
            let database = try Fixture.database(root)
            let body = Fixture.largeBody()
            let publication = try Fixture.publication(root, body: body, role: .externalDocument)
            try database.execute("""
                CREATE TRIGGER reject_second_body_chunk BEFORE INSERT ON framed_sync_ios_available_blob_chunks
                WHEN NEW.byte_offset = 524288 BEGIN SELECT RAISE(ABORT, 'chunk_insert_rejected'); END
                """)
            let receiver = FolioleFramedSyncTransferReceiver(database: database, resourceRoot: root, chunkedBodies: true)
            XCTAssertThrowsError(try receiver.receive(publication.wire, groupKey: Fixture.key,
                context: publication.context)) { error in
                XCTAssertTrue(String(describing: error).contains("chunk_insert_rejected"))
            }
            XCTAssertEqual(try database.rows("SELECT state FROM framed_sync_ios_transfers").first?[0] as? String, "receiving")
            for table in ["available_blobs", "available_blob_chunks", "blob_pins"] {
                XCTAssertTrue(try database.rows("SELECT 1 FROM framed_sync_ios_\(table)").isEmpty)
            }
            XCTAssertGreaterThan(try database.rows("""
                SELECT 1 FROM framed_sync_ios_frames WHERE frame_type = 4 AND length(authenticated_plaintext) > 32
                """).count, 6)
            XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_blob_offers").count, 1)
            try database.execute("DROP TRIGGER reject_second_body_chunk")
            try Fixture.receive(publication, database: database, root: root)
            try Fixture.assertBody(body, publication: publication, database: database)
        }
    }

    func testReadyReopenReplaysDigestFramesAndReceiptPreservesOtherTransferPin() throws {
        try Fixture.withRoot { root in
            let body = Fixture.largeBody()
            let first = try Fixture.publication(root, body: body, role: .nodeBody)
            do {
                let database = try Fixture.database(root)
                try Fixture.receive(first, database: database, root: root)
                try Fixture.assertBody(body, publication: first, database: database)
            }
            let database = try FolioleFramedSyncTransferDatabase(url: root.appendingPathComponent("receiver.db"))
            let framesBefore = try database.rows("""
                SELECT sequence, authenticated_plaintext FROM framed_sync_ios_frames
                WHERE frame_type = 4 ORDER BY sequence
                """)
            XCTAssertGreaterThan(framesBefore.count, 6)
            for row in framesBefore { XCTAssertEqual((row[1] as? Data)?.count, 32) }
            try Fixture.receive(first, database: database, root: root)
            let framesAfter = try database.rows("""
                SELECT sequence, authenticated_plaintext FROM framed_sync_ios_frames
                WHERE frame_type = 4 ORDER BY sequence
                """)
            XCTAssertEqual(framesAfter.map { $0[0] as? String }, framesBefore.map { $0[0] as? String })
            XCTAssertEqual(framesAfter.map { $0[1] as? Data }, framesBefore.map { $0[1] as? Data })
            try Fixture.assertBody(body, publication: first, database: database)
            let original = try XCTUnwrap(try database.rows("""
                SELECT data FROM framed_sync_ios_available_blob_chunks WHERE sha256 = ? AND byte_offset = 0
                """, [first.reference.sha256]).first?[0] as? Data)
            var corrupted = original
            corrupted[0] ^= 1
            try database.execute("UPDATE framed_sync_ios_available_blob_chunks SET data = ? WHERE sha256 = ? AND byte_offset = 0",
                [corrupted, first.reference.sha256])
            XCTAssertThrowsError(try Fixture.receive(first, database: database, root: root)) { error in
                XCTAssertTrue(String(describing: error).contains("inbound_attempt_manifest_mismatch"))
            }
            XCTAssertEqual(try database.rows("SELECT state FROM framed_sync_ios_transfers").first?[0] as? String, "ready_to_apply")
            try database.execute("UPDATE framed_sync_ios_available_blob_chunks SET data = ? WHERE sha256 = ? AND byte_offset = 0",
                [original, first.reference.sha256])
            try Fixture.receive(first, database: database, root: root)
            let second = try Fixture.publication(root, body: body, role: .nodeBody, epoch: "epoch-c")
            XCTAssertNotEqual(first.attempt.transferID, second.attempt.transferID)
            try Fixture.receive(second, database: database, root: root)
            try Fixture.receipt(first, database: database)
            XCTAssertTrue(try database.rows("SELECT 1 FROM framed_sync_ios_transfers WHERE transfer_id = ?",
                [first.attempt.transferID]).isEmpty)
            try Fixture.assertBody(body, publication: second, database: database)
            try Fixture.receipt(second, database: database)
            for table in ["transfers", "frames", "blob_pins", "blob_offers", "available_blobs", "available_blob_chunks"] {
                XCTAssertTrue(try database.rows("SELECT 1 FROM framed_sync_ios_\(table)").isEmpty)
            }
        }
    }
}
