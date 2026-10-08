import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncWholeBodyReceiverTests: XCTestCase {
    private typealias Fixture = FramedSyncWholeBodyReceiverFixture

    func testAuthenticatedEmptyAndLargeBodiesForBothBodyRoles() throws {
        let large = Fixture.largeBody()
        XCTAssertEqual(large.count, 1_048_576)
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

    func testBodyInsertFailureRollsBackReadyButAuthenticatedPublicationCanRetry() throws {
        try Fixture.withRoot { root in
            let database = try Fixture.database(root)
            let body = Fixture.largeBody()
            let publication = try Fixture.publication(root, body: body, role: .externalDocument)
            try database.execute("""
                CREATE TRIGGER reject_body BEFORE INSERT ON framed_sync_ios_available_blobs
                WHEN NEW.byte_length = 1048576 BEGIN SELECT RAISE(ABORT, 'body_insert_rejected'); END
                """)
            let receiver = FolioleFramedSyncTransferReceiver(database: database, resourceRoot: root)
            XCTAssertThrowsError(try receiver.receive(publication.wire, groupKey: Fixture.key,
                context: publication.context)) { error in
                XCTAssertTrue(String(describing: error).contains("body_insert_rejected"))
            }
            XCTAssertEqual(try database.rows("SELECT state FROM framed_sync_ios_transfers").first?[0] as? String, "receiving")
            for table in ["available_blobs", "blob_pins"] {
                XCTAssertTrue(try database.rows("SELECT 1 FROM framed_sync_ios_\(table)").isEmpty)
            }
            XCTAssertEqual(try database.rows("""
                SELECT 1 FROM framed_sync_ios_frames WHERE frame_type = 4 AND length(authenticated_plaintext) > 32
                """).count, 1)
            XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_blob_offers").count, 1)
            try database.execute("DROP TRIGGER reject_body")
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
            XCTAssertEqual(framesBefore.count, 1)
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
                SELECT data FROM framed_sync_ios_available_blobs WHERE sha256 = ?
                """, [first.reference.sha256]).first?[0] as? Data)
            var corrupted = original
            corrupted[0] ^= 1
            try database.execute("UPDATE framed_sync_ios_available_blobs SET data = ? WHERE sha256 = ?",
                [corrupted, first.reference.sha256])
            XCTAssertThrowsError(try Fixture.receive(first, database: database, root: root)) { error in
                XCTAssertTrue(String(describing: error).contains("inbound_attempt_manifest_mismatch"))
            }
            XCTAssertEqual(try database.rows("SELECT state FROM framed_sync_ios_transfers").first?[0] as? String, "ready_to_apply")
            try database.execute("UPDATE framed_sync_ios_available_blobs SET data = ? WHERE sha256 = ?",
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
            for table in ["transfers", "frames", "blob_pins", "blob_offers", "available_blobs"] {
                XCTAssertTrue(try database.rows("SELECT 1 FROM framed_sync_ios_\(table)").isEmpty)
            }
        }
    }
}
