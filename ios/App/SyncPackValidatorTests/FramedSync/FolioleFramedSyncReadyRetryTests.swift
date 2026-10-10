import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncReadyRetryTests: XCTestCase {
    private typealias Fixture = FramedSyncWholeBodyReceiverFixture

    func testNewAttemptAfterReopenPreservesReadyInputUntilAuthenticatedCompletion() throws {
        try Fixture.withRoot { root in
            let body = Fixture.largeBody()
            let first = try Fixture.publication(root, body: body, role: .nodeBody)
            do {
                let database = try Fixture.database(root)
                try Fixture.receive(first, database: database, root: root)
            }
            let retry = try Fixture.publication(root, body: body, role: .nodeBody)
            XCTAssertEqual(first.attempt.transferID, retry.attempt.transferID)
            XCTAssertNotEqual(first.attempt.attemptID, retry.attempt.attemptID)
            let database = try Fixture.database(root)
            let receiver = FolioleFramedSyncTransferReceiver(database: database, resourceRoot: root)
            XCTAssertThrowsError(try receiver.receive(Data(retry.wire.dropLast()), groupKey: Fixture.key,
                context: retry.context)) { error in
                XCTAssertFalse(String(describing: error).contains("inbound_header_conflict"))
            }
            try assertReady(first, database: database)
            try Fixture.assertBody(body, publication: first, database: database)
            try Fixture.receive(retry, database: database, root: root)
            try assertReady(first, database: database)
            try Fixture.assertBody(body, publication: retry, database: database)
            try Fixture.receipt(retry, database: database)
            for table in ["transfers", "frames", "blob_pins", "blob_offers", "available_blobs"] {
                XCTAssertTrue(try database.rows("SELECT 1 FROM framed_sync_ios_\(table)").isEmpty)
            }
        }
    }

    private func assertReady(
        _ publication: Fixture.Publication, database: FolioleFramedSyncTransferDatabase
    ) throws {
        let row = try database.rows("SELECT state, active_attempt_id FROM framed_sync_ios_transfers").first
        XCTAssertEqual(row?[0] as? String, "ready_to_apply")
        XCTAssertEqual(row?[1] as? Data, publication.attempt.attemptID)
    }

    func testAuthenticatedRetryWithChangedManifestOrBodyCannotReplaceReadyInput() throws {
        try Fixture.withRoot { root in
            let body = Fixture.largeBody()
            let first = try Fixture.publication(root, body: body, role: .nodeBody)
            let database = try Fixture.database(root)
            try Fixture.receive(first, database: database, root: root)
            for changeBody in [false, true] {
                let retry = try Fixture.publication(root, body: body, role: .nodeBody)
                let wire = try rewrite(retry.wire) { message in
                    if changeBody, case .blobChunk(var chunk) = message.payload {
                        chunk.data[0] ^= 1; message.payload = .blobChunk(chunk)
                    } else if !changeBody, case .transferHeader(var header) = message.payload {
                        header.manifest.facts[0].sharedStateHash[0] ^= 1
                        message.payload = .transferHeader(header)
                    }
                }
                let receiver = FolioleFramedSyncTransferReceiver(database: database, resourceRoot: root)
                XCTAssertThrowsError(try receiver.receive(wire, groupKey: Fixture.key, context: retry.context))
                try assertReady(first, database: database)
                try Fixture.assertBody(body, publication: first, database: database)
            }
            try Fixture.receive(first, database: database, root: root)
        }
    }

    private func rewrite(
        _ wire: Data, change: (inout Foliole_Sync_V22_ProtocolMessage) -> Void
    ) throws -> Data {
        let reader = FolioleFramedSyncStreamReader(input: InputStream(data: wire))
        let preamble = try reader.nextPreamble()
        let output = OutputStream.toMemory()
        let writer = FolioleFramedSyncStreamWriter(output: output)
        try writer.write(preamble: preamble.encoded)
        while let frame = try reader.nextFrame() {
            let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(groupKey: Fixture.key,
                preamble: preamble, frame: frame, expectedSequence: frame.header.sequence)
            var message = try Foliole_Sync_V22_ProtocolMessage(serializedBytes: plaintext)
            change(&message)
            let encoded = try FolioleFramedSyncCodec.encode(FolioleFramedSyncCodec.validateOutbound(
                message, authenticatedFrameType: frame.header.frameType.rawValue))
            let header = try FolioleFramedSyncWireHeader(ciphertextBytes: encoded.count + 16,
                sequence: frame.header.sequence, frameType: frame.header.frameType).encode()
            let ciphertext = try FolioleFramedSyncFrameCrypto.encrypt(groupKey: Fixture.key,
                preamble: preamble, header: header, plaintext: encoded, sequence: frame.header.sequence)
            try writer.write(header: header, ciphertext: ciphertext)
        }
        return try XCTUnwrap(output.property(forKey: .dataWrittenToMemoryStreamKey) as? Data)
    }
}
