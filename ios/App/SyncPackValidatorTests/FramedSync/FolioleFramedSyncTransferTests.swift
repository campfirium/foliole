import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncTransferTests: XCTestCase {
    func testAuthenticatedTransferBecomesReadyForSharedApply() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-ios-transfer-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let database = try FolioleFramedSyncTransferDatabase(url: directory.appendingPathComponent("stage.db"))
        let receiver = FolioleFramedSyncTransferReceiver(database: database)
        let context = context()
        let contentID = try FolioleFramedSyncCanonicalManifest.contentID(facts: [], blobs: [])
        let transferID = context.deriveTransferID(contentID: contentID)
        let wire = try transferWire(context: context, contentID: contentID, transferID: transferID)

        XCTAssertEqual(
            try receiver.receive(wire, groupKey: Data(0...31), context: context).transferID,
            transferID
        )
        let row = try database.rows(
            "SELECT state, sender_device_id, receiver_device_id FROM framed_sync_ios_transfers"
        ).first
        XCTAssertEqual(row?[0] as? String, "ready_to_apply")
        XCTAssertEqual(row?[1] as? String, "ios-a")
        XCTAssertEqual(row?[2] as? String, "ios-b")
        XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_frames").count, 2)
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
        XCTAssertEqual(try database.rows(
            "SELECT state FROM framed_sync_ios_receipt_attempts"
        ).first?[0] as? String, "replayable")
        XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_receipt_frames").count, 1)
    }

    private func context() -> FolioleFramedSyncTransferContext {
        .init(groupID: "group-a", senderDeviceID: "ios-a", senderLibraryEpoch: "epoch-a",
              receiverDeviceID: "ios-b", receiverLibraryEpoch: "epoch-b")
    }

    private func transferWire(
        context: FolioleFramedSyncTransferContext, contentID: Data, transferID: Data
    ) throws -> Data {
        let attemptID = Data(repeating: 7, count: 16)
        var manifest = Foliole_Sync_V22_TransferManifest()
        manifest.protocolVersion = 22; manifest.groupID = context.groupID; manifest.contentID = contentID
        var header = Foliole_Sync_V22_TransferHeader()
        header.transferID = transferID; header.attemptID = attemptID; header.manifest = manifest
        var trailer = Foliole_Sync_V22_TransferTrailer()
        trailer.transferID = transferID; trailer.manifestHash = contentID
        var first = Foliole_Sync_V22_ProtocolMessage(); first.payload = .transferHeader(header)
        var last = Foliole_Sync_V22_ProtocolMessage(); last.payload = .transferTrailer(trailer)
        let preamble = try transferPreamble(transferID: transferID, attemptID: attemptID)
        let output = OutputStream.toMemory(); let writer = FolioleFramedSyncStreamWriter(output: output)
        try writer.write(preamble: preamble.encoded)
        for (sequence, item) in [first, last].enumerated() {
            let validated = try FolioleFramedSyncCodec.validateOutbound(
                item, authenticatedFrameType: sequence == 0
                    ? FolioleFramedSyncFrameType.transferHeader.rawValue
                    : FolioleFramedSyncFrameType.transferTrailer.rawValue
            )
            let plaintext = try FolioleFramedSyncCodec.encode(validated)
            let frameType: FolioleFramedSyncFrameType = sequence == 0 ? .transferHeader : .transferTrailer
            let header = try FolioleFramedSyncWireHeader(
                ciphertextBytes: plaintext.count + 16, sequence: UInt64(sequence), frameType: frameType
            ).encode()
            let ciphertext = try FolioleFramedSyncFrameCrypto.encrypt(
                groupKey: Data(0...31), preamble: preamble, header: header,
                plaintext: plaintext, sequence: UInt64(sequence)
            )
            try writer.write(header: header, ciphertext: ciphertext)
        }
        return try XCTUnwrap(output.property(forKey: .dataWrittenToMemoryStreamKey) as? Data)
    }

    private func transferPreamble(transferID: Data, attemptID: Data) throws -> FolioleFramedSyncPreamble {
        var bytes = Data(repeating: 0, count: FolioleFramedSyncPreamble.byteCount)
        bytes.replaceSubrange(0..<8, with: Data("FOLSYNC2".utf8)); bytes[9] = 96
        bytes[11] = 22; bytes[12] = 2
        bytes.replaceSubrange(16..<48, with: transferID)
        bytes.replaceSubrange(48..<64, with: attemptID)
        bytes.replaceSubrange(64..<68, with: Data([1, 2, 3, 4]))
        return try .init(decoding: bytes)
    }
}
