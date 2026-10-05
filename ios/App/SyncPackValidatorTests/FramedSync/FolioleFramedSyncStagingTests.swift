import Foundation
import SQLite3
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncStagingTests: XCTestCase {
    func testValidatedFrameIsIdempotentAndSurvivesAdapterRestart() throws {
        let fixture = try makeFixture()
        var adapter: FolioleFramedSyncInboundStagingAdapter? = try .init(databaseURL: fixture.databaseURL)

        XCTAssertEqual(try adapter?.commitAuthenticatedFrame(fixture.frame, context: fixture.context), .created)
        XCTAssertEqual(try adapter?.commitAuthenticatedFrame(fixture.frame, context: fixture.context), .identical)
        adapter = nil

        XCTAssertEqual(try frameCount(fixture.databaseURL), 1)
        let reopened = try FolioleFramedSyncInboundStagingAdapter(databaseURL: fixture.databaseURL)
        XCTAssertEqual(try reopened.commitAuthenticatedFrame(fixture.frame, context: fixture.context), .identical)
    }

    func testInvalidPayloadAndConflictingReplayNeverOverwriteDurableFrame() throws {
        let fixture = try makeFixture()
        let staging = try FolioleFramedSyncSQLiteStaging(databaseURL: fixture.databaseURL)
        let adapter = FolioleFramedSyncInboundStagingAdapter(staging: staging)
        var invalid = fixture.frame
        invalid = FolioleFramedSyncAuthenticatedFrame(
            transferID: invalid.transferID,
            attemptID: invalid.attemptID,
            preamble: invalid.preamble,
            header: invalid.header,
            ciphertext: invalid.ciphertext,
            plaintext: Data([1, 2, 3])
        )
        XCTAssertThrowsError(try adapter.commitAuthenticatedFrame(invalid, context: fixture.context))
        XCTAssertEqual(try frameCount(fixture.databaseURL), 0)

        XCTAssertEqual(try adapter.commitAuthenticatedFrame(fixture.frame, context: fixture.context), .created)
        let conflict = FolioleFramedSyncAuthenticatedFrame(
            transferID: fixture.frame.transferID,
            attemptID: fixture.frame.attemptID,
            preamble: fixture.frame.preamble,
            header: fixture.frame.header,
            ciphertext: Data(repeating: 9, count: fixture.frame.ciphertext.count),
            plaintext: fixture.frame.plaintext
        )
        XCTAssertThrowsError(try adapter.commitAuthenticatedFrame(conflict, context: fixture.context)) { error in
            XCTAssertEqual(
                error as? FolioleFramedSyncValidationError,
                FolioleFramedSyncValidationError("inbound_frame_identity_conflict")
            )
        }
        XCTAssertEqual(try frameCount(fixture.databaseURL), 1)
    }

    private func makeFixture() throws -> StagingFixture {
        let golden = try XCTUnwrap(try FramedSyncFixture.load().corpus.messages.first {
            $0.payloadCase == "transfer_header"
        })
        let plaintext = try XCTUnwrap(Data(base64Encoded: golden.base64))
        let validated = try FolioleFramedSyncCodec.decode(
            plaintext,
            authenticatedFrameType: FolioleFramedSyncFrameType.transferHeader.rawValue
        )
        guard case .transferHeader(let message) = validated.payload else {
            throw FolioleFramedSyncValidationError("test_transfer_header_missing")
        }
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-framed-stage-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let databaseURL = directory.appendingPathComponent("stage.sqlite")
        _ = try FolioleFramedSyncTransferDatabase(url: databaseURL)
        let ciphertext = Data([0, 255, 7])
        let header = try FolioleFramedSyncWireHeader(
            ciphertextBytes: ciphertext.count,
            sequence: 9,
            frameType: .transferHeader
        ).encode()
        return StagingFixture(
            databaseURL: databaseURL,
            context: .init(
                groupID: message.manifest.groupID, senderDeviceID: "sender",
                senderLibraryEpoch: "sender-epoch", receiverDeviceID: "receiver",
                receiverLibraryEpoch: "receiver-epoch"
            ),
            frame: FolioleFramedSyncAuthenticatedFrame(
                transferID: message.transferID,
                attemptID: message.attemptID,
                preamble: FolioleFramedSyncWireTests.preamble(),
                header: header,
                ciphertext: ciphertext,
                plaintext: plaintext
            )
        )
    }

    private func frameCount(_ url: URL) throws -> Int {
        var database: OpaquePointer?
        guard sqlite3_open_v2(url.path, &database, SQLITE_OPEN_READONLY, nil) == SQLITE_OK,
              let database else { throw FolioleFramedSyncValidationError("test_database_open_failed") }
        defer { sqlite3_close(database) }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, "SELECT count(*) FROM framed_sync_ios_frames", -1,
                                 &statement, nil) == SQLITE_OK, let statement else {
            throw FolioleFramedSyncValidationError("test_database_query_failed")
        }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW else {
            throw FolioleFramedSyncValidationError("test_database_query_failed")
        }
        return Int(sqlite3_column_int(statement, 0))
    }

}

private struct StagingFixture {
    let databaseURL: URL
    let context: FolioleFramedSyncTransferContext
    let frame: FolioleFramedSyncAuthenticatedFrame
}
