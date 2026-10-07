import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncTransferTests: XCTestCase {
    func testCanonicalContentIdentityMatchesSharedGoldenVector() throws {
        let articleBlob = blob(0x77, byteLength: 42, role: .nodeBody, required: true)
        let reviewBlob = blob(0x66, byteLength: 512, role: .image, required: false)
        let article = fact(
            kind: .nodeVersion, objectType: "node", globalID: "node-1", factID: "version-7",
            sharedStateHash: Data(repeating: 0x44, count: 32), blobs: [articleBlob], fields: [
                field("title", .stringValue("A framed article")),
                field("deleted", .boolValue(false)),
                field("revision", .unsignedValue(7))
            ]
        )
        let review = fact(
            kind: .review, objectType: "review", globalID: "node-1", factID: "review-3",
            sharedStateHash: Data(repeating: 0x55, count: 32), blobs: [reviewBlob], fields: [
                field("rating", .signedValue(-1)), field("note", .nullValue(true))
            ]
        )

        XCTAssertEqual(
            try FolioleFramedSyncCanonicalManifest.contentID(
                facts: [review, article], blobs: [articleBlob, reviewBlob]
            ).hex,
            "d2dca32bfb3f929303143a893241d87c1ed85088c1ca6db8e3230a47b7d9c13c"
        )
    }

    func testAuthenticatedTransferBecomesReadyForSharedApply() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-ios-transfer-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let database = try FolioleFramedSyncTransferDatabase(url: directory.appendingPathComponent("stage.db"))
        let receiver = FolioleFramedSyncTransferReceiver(database: database)
        let context = context()
        let contentID = try FolioleFramedSyncCanonicalManifest.contentID(facts: [], blobs: [])
        let transferID = context.deriveTransferID(contentID: contentID)
        let wire = try FramedSyncRecoveryWire.transfer(context: context, contentID: contentID, transferID: transferID)
        let responseURL = directory.appendingPathComponent("response.bin")
        try wire.write(to: responseURL)

        XCTAssertEqual(
            try receiver.receive(responseURL, groupKey: Data(0...31), context: context).transferID,
            transferID
        )
        let row = try database.rows(
            "SELECT state, sender_device_id, receiver_device_id FROM framed_sync_ios_transfers"
        ).first
        XCTAssertEqual(row?[0] as? String, "ready_to_apply")
        XCTAssertEqual(row?[1] as? String, "ios-a")
        XCTAssertEqual(row?[2] as? String, "ios-b")
        XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_frames").count, 2)
        let reopened = try FolioleFramedSyncTransferDatabase(url: directory.appendingPathComponent("stage.db"))
        XCTAssertEqual(try FolioleFramedSyncTransferReceiver(database: reopened).receive(
            wire, groupKey: Data(0...31), context: context).transferID, transferID)
        XCTAssertEqual(try reopened.rows("SELECT 1 FROM framed_sync_ios_frames").count, 2)
    }

    func testInterruptedAttemptReopensReplaysAndCompletesFromDurableFrames() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-ios-transfer-resume-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let databaseURL = directory.appendingPathComponent("stage.db")
        let context = context()
        let contentID = try FolioleFramedSyncCanonicalManifest.contentID(facts: [], blobs: [])
        let transferID = context.deriveTransferID(contentID: contentID)
        let wire = try FramedSyncRecoveryWire.transfer(context: context, contentID: contentID, transferID: transferID)
        let partial = try FramedSyncRecoveryWire.firstFrame(wire)

        do {
            let database = try FolioleFramedSyncTransferDatabase(url: databaseURL)
            let receiver = FolioleFramedSyncTransferReceiver(database: database)
            XCTAssertThrowsError(try receiver.receive(
                partial, groupKey: Data(0...31), context: context
            ))
            XCTAssertEqual(try database.rows(
                "SELECT state FROM framed_sync_ios_transfers"
            ).first?[0] as? String, "receiving")
            XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_frames").count, 1)
            XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_blob_pins").count, 0)
        }

        let reopened = try FolioleFramedSyncTransferDatabase(url: databaseURL)
        let receiver = FolioleFramedSyncTransferReceiver(database: reopened)
        XCTAssertEqual(try receiver.receive(
            wire, groupKey: Data(0...31), context: context
        ).transferID, transferID)
        XCTAssertEqual(try reopened.rows(
            "SELECT state FROM framed_sync_ios_transfers"
        ).first?[0] as? String, "ready_to_apply")
        XCTAssertEqual(try reopened.rows("SELECT 1 FROM framed_sync_ios_frames").count, 2)
    }

    func testReceiptIsEncryptedAndBoundToTransfer() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-ios-receipt-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let database = try FolioleFramedSyncTransferDatabase(url: directory.appendingPathComponent("stage.db"))
        let transferID = Data(repeating: 3, count: 32)
        let wire = try FolioleFramedSyncReceiptWriter.encode(groupKey: Data(0...31), value: [
            "transfer_id": transferID.hex, "content_id": Data(repeating: 4, count: 32).hex,
            "applied_state_hash": Data(repeating: 5, count: 32).hex,
            "receiver_device_id": "ios-b", "receiver_library_epoch": "epoch-b"
        ], database: database)
        let reader = FolioleFramedSyncStreamReader(input: InputStream(data: wire))
        let preamble = try reader.nextPreamble()
        let frame = try XCTUnwrap(reader.nextFrame())
        let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(
            groupKey: Data(0...31), preamble: preamble, frame: frame, expectedSequence: 0
        )
        let decoded = try FolioleFramedSyncCodec.decode(
            plaintext, authenticatedFrameType: frame.header.frameType.rawValue
        )
        guard case .transferReceipt(let receipt) = decoded.payload else {
            return XCTFail("expected transfer receipt")
        }
        XCTAssertEqual(preamble.contextID, transferID)
        XCTAssertEqual(receipt.transferID, transferID)
        XCTAssertNil(try reader.nextFrame())
        XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_receipts").count, 0)
        XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_receipt_attempts").count, 0)
        XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_receipt_frames").count, 0)
    }

    func testNewAttemptReplacesInterruptedAttemptWithTheSamePublication() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-ios-retry-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let database = try FolioleFramedSyncTransferDatabase(url: directory.appendingPathComponent("stage.db"))
        let receiver = FolioleFramedSyncTransferReceiver(database: database)
        let context = context()
        let contentID = try FolioleFramedSyncCanonicalManifest.contentID(facts: [], blobs: [])
        let transferID = context.deriveTransferID(contentID: contentID)
        let first = try FramedSyncRecoveryWire.transfer(context: context, contentID: contentID, transferID: transferID)
        XCTAssertThrowsError(try receiver.receive(
            FramedSyncRecoveryWire.firstFrame(first), groupKey: Data(0...31), context: context))
        let second = try FramedSyncRecoveryWire.transfer(context: context, contentID: contentID, transferID: transferID,
                                      attemptID: Data(repeating: 9, count: 16))
        XCTAssertEqual(try receiver.receive(second, groupKey: Data(0...31), context: context).transferID, transferID)
        XCTAssertEqual(try database.rows("SELECT state FROM framed_sync_ios_transfers").first?[0] as? String,
                       "ready_to_apply")
    }

    private func context() -> FolioleFramedSyncTransferContext {
        .init(groupID: "group-a", senderDeviceID: "ios-a", senderLibraryEpoch: "epoch-a",
              receiverDeviceID: "ios-b", receiverLibraryEpoch: "epoch-b")
    }

    private func blob(
        _ byte: UInt8, byteLength: UInt64, role: Foliole_Sync_V22_BlobRole, required: Bool
    ) -> Foliole_Sync_V22_BlobReference {
        var value = Foliole_Sync_V22_BlobReference()
        value.sha256 = Data(repeating: byte, count: 32); value.byteLength = byteLength
        value.role = role; value.required = required
        return value
    }

    private func field(
        _ name: String, _ valueCase: Foliole_Sync_V22_CanonicalValue.OneOf_Value
    ) -> Foliole_Sync_V22_CanonicalField {
        var value = Foliole_Sync_V22_CanonicalValue(); value.value = valueCase
        var result = Foliole_Sync_V22_CanonicalField(); result.name = name; result.value = value
        return result
    }

    private func fact(
        kind: Foliole_Sync_V22_FactKind, objectType: String, globalID: String, factID: String,
        sharedStateHash: Data, blobs: [Foliole_Sync_V22_BlobReference],
        fields: [Foliole_Sync_V22_CanonicalField]
    ) -> Foliole_Sync_V22_FactRecord {
        var identity = Foliole_Sync_V22_FactIdentity()
        identity.kind = kind; identity.objectType = objectType
        identity.globalID = globalID; identity.factID = factID
        var body = Foliole_Sync_V22_CanonicalObject(); body.fields = fields
        var result = Foliole_Sync_V22_FactRecord()
        result.identity = identity; result.sharedStateHash = sharedStateHash
        result.body = body; result.blobs = blobs
        return result
    }


}
