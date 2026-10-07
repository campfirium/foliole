import CryptoKit
import Foundation
import XCTest
import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncChunkedBodiesTests: XCTestCase {
    func testOversizedPersistedFrameAndAvailableChunkAreRejected() throws {
        let fixture = try FramedSyncChunkedBodyFixture()
        let reference = fixture.reference(Data([1]), required: false)
        try fixture.database.execute("""
            INSERT INTO framed_sync_ios_frames VALUES (?, ?, '0', 4, ?, ?, ?, zeroblob(?))
            """, [fixture.transferID, fixture.attemptID, Data([1]), Data([1]), Data([1]),
                   FolioleFramedSyncLimits.maxFrameMessageBytes + 1])
        XCTAssertThrowsError(try fixture.promote(reference))
        XCTAssertEqual(try fixture.count("framed_sync_ios_available_blobs"), 0)
        try fixture.database.execute("INSERT INTO framed_sync_ios_available_blobs VALUES (?, 1)", [reference.sha256])
        try fixture.database.execute("PRAGMA ignore_check_constraints = ON")
        try fixture.database.execute("INSERT INTO framed_sync_ios_available_blob_chunks VALUES (?, 0, zeroblob(524289))",
                                     [reference.sha256])
        XCTAssertThrowsError(try fixture.promote(reference))
    }

    func testResourceDigestFrameIsExcludedFromBodyDecoding() throws {
        let fixture = try FramedSyncChunkedBodyFixture()
        let body = Data([1, 2, 3])
        let reference = fixture.reference(body)
        try fixture.database.execute("INSERT INTO framed_sync_ios_frames VALUES (?, ?, '0', 4, ?, ?, ?, ?)",
                                     [fixture.transferID, fixture.attemptID, Data([1]), Data([1]),
                                      Data([1]), Data(repeating: 99, count: 32)])
        try fixture.stage(reference, sequence: 1, offset: 0, data: body)
        XCTAssertTrue(try fixture.promote(reference))
        XCTAssertEqual(try fixture.count("framed_sync_ios_frames"), 2)
        XCTAssertEqual(try fixture.count("framed_sync_ios_available_resources"), 0)
    }

    func testOutOfOrderChunksAndZeroLengthChunksPreserveOriginalAssembly() throws {
        let fixture = try FramedSyncChunkedBodyFixture()
        let body = Data("body 🌿".utf8)
        let reference = fixture.reference(body)
        try fixture.stage(reference, sequence: 1, offset: 4, data: body.subdata(in: 4..<body.count))
        try fixture.stage(reference, sequence: 2, offset: 0, data: Data())
        try fixture.stage(reference, sequence: 12, offset: 0, data: body.subdata(in: 0..<4))
        XCTAssertTrue(try fixture.promote(reference))
        XCTAssertEqual(try fixture.database.rows("SELECT data FROM framed_sync_ios_available_blob_chunks").first?[0] as? Data, body)
    }

    func testLargeUnicodeReblocksAndEmptyBodyRequiresNoChunk() throws {
        let fixture = try FramedSyncChunkedBodyFixture()
        let body = Data(String(repeating: "🌿\\\"\n", count: 350_000).utf8)
        let reference = fixture.reference(body)
        var offset = 0
        var sequence = 0
        while offset < body.count {
            let end = min(offset + 123_457, body.count)
            try fixture.stage(reference, sequence: sequence, offset: UInt64(offset), data: body.subdata(in: offset..<end))
            offset = end
            sequence += 1
        }
        let empty = fixture.reference(Data())
        let promoter = fixture.promoter
        try fixture.database.transaction {
            XCTAssertTrue(try promoter.verifyAndPromote(reference))
            XCTAssertTrue(try promoter.verifyAndPromote(empty))
        }
        var digest = SHA256()
        for row in try fixture.database.rows("SELECT data FROM framed_sync_ios_available_blob_chunks ORDER BY byte_offset") {
            let bytes = try XCTUnwrap(row[0] as? Data)
            XCTAssertLessThanOrEqual(bytes.count, 524_288)
            digest.update(data: bytes)
        }
        XCTAssertEqual(Data(digest.finalize()), reference.sha256)
        XCTAssertEqual(try fixture.count("framed_sync_ios_available_blobs"), 2)
    }

    func testOptionalAbsentAndOnlyEmptyChunksRemainMissing() throws {
        let fixture = try FramedSyncChunkedBodyFixture()
        let reference = fixture.reference(Data([1]), required: false)
        XCTAssertFalse(try fixture.promote(reference))
        try fixture.stage(reference, sequence: 0, offset: 0, data: Data())
        XCTAssertFalse(try fixture.promote(reference))
        var required = reference
        required.required = true
        XCTAssertThrowsError(try fixture.promote(required))
        XCTAssertEqual(try fixture.count("framed_sync_ios_available_blobs"), 0)
    }

    func testGapOverlapAndWrongHashRejectBeforeHeaderWrite() throws {
        for mode in 0..<3 {
            let fixture = try FramedSyncChunkedBodyFixture()
            let reference = fixture.reference(Data([1, 2, 3, 4]), required: false)
            try fixture.stage(reference, sequence: 0, offset: 0, data: Data([1, 2]))
            let offset: UInt64 = mode == 0 ? 3 : mode == 1 ? 1 : 2
            try fixture.stage(reference, sequence: 1, offset: offset, data: Data([3, 9]))
            XCTAssertThrowsError(try fixture.promote(reference)) { error in
                XCTAssertEqual((error as? FolioleFramedSyncValidationError)?.code, "inbound_attempt_manifest_mismatch")
            }
            XCTAssertEqual(try fixture.count("framed_sync_ios_available_blobs"), 0)
        }
    }

    func testExistingHeaderMissingChunksWrongHashOrWrongLengthNeverFallsBack() throws {
        for mode in 0..<3 {
            let fixture = try FramedSyncChunkedBodyFixture()
            let body = Data([1, 2, 3])
            let reference = fixture.reference(body, required: false)
            try fixture.stage(reference, sequence: 0, offset: 0, data: body)
            try fixture.database.execute("INSERT INTO framed_sync_ios_available_blobs VALUES (?, ?)",
                                         [reference.sha256, mode == 2 ? 4 : 3])
            if mode == 1 {
                try fixture.database.execute("INSERT INTO framed_sync_ios_available_blob_chunks VALUES (?, 0, ?)",
                                             [reference.sha256, Data([1, 2, 4])])
            }
            XCTAssertThrowsError(try fixture.promote(reference))
        }
    }

    func testChunkInsertFailureRollsBackAndCanRetryReceivingFrames() throws {
        let fixture = try FramedSyncChunkedBodyFixture()
        let body = Data([1, 2, 3])
        let reference = fixture.reference(body)
        try fixture.stage(reference, sequence: 0, offset: 0, data: body)
        try fixture.database.execute("""
            CREATE TRIGGER fail_chunk BEFORE INSERT ON framed_sync_ios_available_blob_chunks
            BEGIN SELECT RAISE(ABORT, 'chunk_failure'); END
            """)
        XCTAssertThrowsError(try fixture.promote(reference))
        XCTAssertEqual(try fixture.count("framed_sync_ios_available_blobs"), 0)
        XCTAssertEqual(try fixture.count("framed_sync_ios_available_blob_chunks"), 0)
        XCTAssertEqual(try fixture.count("framed_sync_ios_frames"), 1)
        try fixture.database.execute("DROP TRIGGER fail_chunk")
        XCTAssertTrue(try fixture.promote(reference))
    }

    func testExistingAvailableBodySurvivesReopenWithOnlyDigestFrames() throws {
        let saved = try makeReadyBody()
        defer { try? FileManager.default.removeItem(at: saved.url.deletingLastPathComponent()) }
        let reopened = try FolioleFramedSyncTransferDatabase(url: saved.url)
        let promoter = FolioleFramedSyncChunkedBodies(database: reopened,
            transferID: saved.transferID, attemptID: saved.attemptID)
        XCTAssertTrue(try reopened.transaction { try promoter.verifyAndPromote(saved.reference) })
    }

    private func makeReadyBody() throws -> (
        url: URL, transferID: Data, attemptID: Data, reference: Foliole_Sync_V22_BlobReference
    ) {
        let fixture = try FramedSyncChunkedBodyFixture()
        let body = Data("ready body".utf8)
        let reference = fixture.reference(body)
        try fixture.stage(reference, sequence: 0, offset: 0, data: body)
        XCTAssertTrue(try fixture.promote(reference))
        try fixture.database.execute("UPDATE framed_sync_ios_frames SET authenticated_plaintext = ?", [Data(repeating: 1, count: 32)])
        fixture.preserveRoot = true
        return (fixture.database.url, fixture.transferID, fixture.attemptID, reference)
    }
}
