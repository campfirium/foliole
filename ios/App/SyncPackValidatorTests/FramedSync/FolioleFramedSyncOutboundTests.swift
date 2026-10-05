import CryptoKit
import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncOutboundTests: XCTestCase {
    private let groupKey = Data(repeating: 0, count: 32)

    func testTransferIsDurableAndReplaysExactCanonicalFramesAfterRestart() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-ios-outbound-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let databaseURL = directory.appendingPathComponent("outbound.db")
        let database = try FolioleFramedSyncTransferDatabase(url: databaseURL)
        let staging = FolioleFramedSyncOutboundSQLite(database: database)
        let body = Data("outbound body".utf8)
        let fact = makeFact(body: body)
        let attempt = try FolioleFramedSyncTransferWriter.prepare(
            groupKey: groupKey, context: context(), facts: [fact],
            blobs: [.init(reference: fact.blobs[0], data: body)], staging: staging
        )
        let first = try FolioleFramedSyncTransferWriter.replay(attempt, staging: staging)
        let reopened = try FolioleFramedSyncOutboundSQLite(
            database: FolioleFramedSyncTransferDatabase(url: databaseURL)
        )
        let replay = try FolioleFramedSyncTransferWriter.replay(attempt, staging: reopened)

        XCTAssertEqual(first, replay)
        let reader = FolioleFramedSyncStreamReader(input: InputStream(data: replay))
        let preamble = try reader.nextPreamble()
        XCTAssertEqual(preamble.contextID, attempt.transferID)
        for (sequence, type) in [
            FolioleFramedSyncFrameType.transferHeader, .fact, .blobChunk, .transferTrailer
        ].enumerated() {
            let frame = try XCTUnwrap(reader.nextFrame())
            XCTAssertEqual(frame.header.frameType, type)
            let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(
                groupKey: groupKey, preamble: preamble, frame: frame,
                expectedSequence: UInt64(sequence)
            )
            _ = try FolioleFramedSyncCodec.decode(plaintext, authenticatedFrameType: type.rawValue)
        }
        XCTAssertNil(try reader.nextFrame())
        XCTAssertEqual(try database.rows(
            "SELECT state FROM framed_sync_ios_outbound_attempts"
        ).first?[0] as? String, "replayable")
    }

    func testReceiptReaderAcceptsOnlyTheExpectedReceiverAndContent() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-ios-outbound-receipt-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let database = try FolioleFramedSyncTransferDatabase(url: directory.appendingPathComponent("stage.db"))
        let transferID = Data(repeating: 3, count: 32)
        let contentID = Data(repeating: 4, count: 32)
        let wire = try FolioleFramedSyncReceiptWriter.encode(groupKey: groupKey, value: [
            "transfer_id": transferID.hex, "content_id": contentID.hex,
            "applied_state_hash": Data(repeating: 5, count: 32).hex,
            "receiver_device_id": "ios-b", "receiver_library_epoch": "epoch-b"
        ], database: database)

        let receipt = try FolioleFramedSyncReceiptReader.read(
            wire, groupKey: groupKey, transferID: transferID, contentID: contentID,
            receiverDeviceID: "ios-b", receiverLibraryEpoch: "epoch-b"
        )
        XCTAssertEqual(receipt.transferID, transferID)
        XCTAssertThrowsError(try FolioleFramedSyncReceiptReader.read(
            wire, groupKey: groupKey, transferID: transferID, contentID: contentID,
            receiverDeviceID: "another-device", receiverLibraryEpoch: "epoch-b"
        )) { error in
            XCTAssertEqual(
                error as? FolioleFramedSyncValidationError,
                FolioleFramedSyncValidationError("framed_sync_receipt_identity_mismatch")
            )
        }
    }

    private func context() -> FolioleFramedSyncTransferContext {
        .init(groupID: "group", senderDeviceID: "sender", senderLibraryEpoch: "sender-epoch",
              receiverDeviceID: "receiver", receiverLibraryEpoch: "receiver-epoch")
    }

    private func makeFact(body: Data) -> Foliole_Sync_V22_FactRecord {
        var blob = Foliole_Sync_V22_BlobReference()
        blob.sha256 = Data(SHA256.hash(data: body)); blob.byteLength = UInt64(body.count)
        blob.role = .nodeBody; blob.required = true
        var identity = Foliole_Sync_V22_FactIdentity()
        identity.kind = .nodeVersion; identity.objectType = "node"
        identity.globalID = "node-1"; identity.factID = "version-1"
        var fact = Foliole_Sync_V22_FactRecord()
        fact.identity = identity; fact.sharedStateHash = Data(repeating: 0, count: 32)
        fact.body = .init(); fact.blobs = [blob]
        return fact
    }
}
