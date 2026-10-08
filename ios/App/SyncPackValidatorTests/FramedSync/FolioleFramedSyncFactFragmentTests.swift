import CryptoKit
import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncFactFragmentTests: XCTestCase {
    func testCompletedLargeFactKeepsOrdinaryFrameLimitAndOriginalStringLimit() throws {
        let fact = largeFact()
        let bytes = try encoded(fact)
        XCTAssertGreaterThan(bytes.count, FolioleFramedSyncLimits.maxFrameMessageBytes)
        XCTAssertThrowsError(try FolioleFramedSyncCodec.decode(bytes, authenticatedFrameType: 3))
        guard case .fact(let decoded) = try FolioleFramedSyncCodec.decodeCompletedFact(bytes).payload else {
            return XCTFail("original fact required")
        }
        XCTAssertEqual(decoded, fact)
        var invalid = fact
        invalid.body.fields[0].value.value = .stringValue(String(repeating: "x", count: 1536 * 1024 + 1))
        XCTAssertThrowsError(try FolioleFramedSyncCodec.decodeCompletedFact(encoded(invalid)))
        let tooSmall = Data(repeating: 1, count: FolioleFramedSyncLimits.maxFrameMessageBytes)
        XCTAssertThrowsError(try FolioleFramedSyncCodec.decodeCompletedFact(tooSmall))
        XCTAssertThrowsError(try FolioleFramedSyncCodec.decodeCompletedFact(
            Data(repeating: 1, count: FolioleFramedSyncLimits.maxFragmentedFactBytes + 1)))
    }

    func testFragmentRejectsWrongOffsetsIdentitiesDigestsAndTotals() throws {
        let fragments = try fragments(largeFact())
        var tracker = try FolioleFramedSyncFactFragmentTracker(first: fragments[0], sequence: 1)
        try tracker.append(fragments[0], sequence: 1)
        for mutation in 0..<5 {
            var changed = fragments[1]
            switch mutation {
            case 0: changed.offset += 1
            case 1: changed.identity.factID = "other-version"
            case 2: changed.sharedStateHash = Data(repeating: 8, count: 32)
            case 3: changed.encodedSha256 = Data(repeating: 9, count: 32)
            default: changed.totalByteLength += 1
            }
            var copy = tracker
            XCTAssertThrowsError(try copy.append(changed, sequence: 2))
        }
        XCTAssertThrowsError(try tracker.append(fragments[1], sequence: 3))
        var oversized = fragments[0]
        oversized.data = Data(repeating: 1, count: 512 * 1024 + 1)
        var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .factFragment(oversized)
        XCTAssertThrowsError(try FolioleFramedSyncCodec.validateOutbound(message, authenticatedFrameType: 3))
    }

    func testInterruptedLargeFactReopensCompletesAndReadsOneOriginalFactFromDurableFrames() throws {
        try FramedSyncWholeBodyReceiverFixture.withRoot { root in
            let fact = largeFact()
            let parts = try fragments(fact)
            let wire = try wire(fact, fragments: parts)
            let databaseURL = root.appendingPathComponent("receiver.db")
            do {
                let database = try FolioleFramedSyncTransferDatabase(url: databaseURL)
                let receiver = FolioleFramedSyncTransferReceiver(database: database, resourceRoot: root)
                XCTAssertThrowsError(try receiver.receive(prefix(wire, frames: 2), groupKey: Data(0...31), context: context))
                XCTAssertEqual(try database.rows("SELECT state FROM framed_sync_ios_transfers").first?[0] as? String, "receiving")
                XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_frames").count, 2)
            }
            let reopened = try FolioleFramedSyncTransferDatabase(url: databaseURL)
            let receiver = FolioleFramedSyncTransferReceiver(database: reopened, resourceRoot: root)
            let received = try receiver.receive(wire, groupKey: Data(0...31), context: context)
            XCTAssertEqual(try reopened.rows("SELECT state FROM framed_sync_ios_transfers").first?[0] as? String, "ready_to_apply")
            let restored = try FolioleFramedSyncDurableFactReader.read(database: reopened,
                transferID: received.transferID, attemptID: attemptID, firstSequence: 1)
            XCTAssertEqual(restored, fact)
            let index = FolioleFramedSyncReadyFactIndex()
            try index.append(restored, sequence: 1)
            XCTAssertEqual(index.count, 1)
            XCTAssertEqual(try index.contentID(database: reopened, transferID: received.transferID,
                attemptID: attemptID, blobs: []), try FolioleFramedSyncCanonicalManifest.contentID(facts: [fact], blobs: []))
            XCTAssertEqual(try reopened.rows("SELECT 1 FROM framed_sync_ios_frames").count, parts.count + 2)
            XCTAssertEqual(try receiver.receive(wire, groupKey: Data(0...31), context: context).transferID, received.transferID)
        }
    }

    func testWrongDigestOrMissingTailNeverBecomesReady() throws {
        for fault in ["digest", "tail"] {
            try FramedSyncWholeBodyReceiverFixture.withRoot { root in
                let fact = largeFact()
                var parts = try fragments(fact)
                if fault == "digest" {
                    for index in parts.indices { parts[index].encodedSha256 = Data(repeating: 8, count: 32) }
                } else { parts.removeLast() }
                let database = try FramedSyncWholeBodyReceiverFixture.database(root)
                let receiver = FolioleFramedSyncTransferReceiver(database: database, resourceRoot: root)
                XCTAssertThrowsError(try receiver.receive(wire(fact, fragments: parts), groupKey: Data(0...31), context: context))
                XCTAssertEqual(try database.rows("SELECT state FROM framed_sync_ios_transfers").first?[0] as? String, "receiving")
                XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_receipts").count, 0)
                XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_blob_pins").count, 0)
            }
        }
    }

    private let attemptID = Data(repeating: 7, count: 16)
    private let context = FolioleFramedSyncTransferContext(groupID: "group-a", senderDeviceID: "ios-a",
        senderLibraryEpoch: "epoch-a", receiverDeviceID: "ios-b", receiverLibraryEpoch: "epoch-b")

    private func largeFact() -> Foliole_Sync_V22_FactRecord {
        var fact = Foliole_Sync_V22_FactRecord()
        fact.identity.kind = .nodeVersion; fact.identity.objectType = "node"
        fact.identity.globalID = "node-1"; fact.identity.factID = "original-version"
        fact.sharedStateHash = Data(repeating: 7, count: 32)
        fact.body.fields = ["first", "second"].map { name in
            var field = Foliole_Sync_V22_CanonicalField(); field.name = name
            field.value.value = .stringValue(String(repeating: "a", count: 1100 * 1024))
            return field
        }
        return fact
    }

    private func encoded(_ fact: Foliole_Sync_V22_FactRecord) throws -> Data {
        var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .fact(fact)
        return try message.serializedData()
    }

    private func fragments(_ fact: Foliole_Sync_V22_FactRecord) throws -> [Foliole_Sync_V22_FactFragment] {
        let bytes = try encoded(fact), hash = Data(SHA256.hash(data: bytes))
        return stride(from: 0, to: bytes.count, by: 512 * 1024).map { offset in
            var part = Foliole_Sync_V22_FactFragment()
            part.identity = fact.identity; part.sharedStateHash = fact.sharedStateHash
            part.encodedSha256 = hash; part.totalByteLength = UInt64(bytes.count); part.offset = UInt64(offset)
            part.data = bytes.subdata(in: offset..<min(bytes.count, offset + 512 * 1024))
            return part
        }
    }

    private func wire(_ fact: Foliole_Sync_V22_FactRecord, fragments: [Foliole_Sync_V22_FactFragment]) throws -> Data {
        let contentID = try FolioleFramedSyncCanonicalManifest.contentID(facts: [fact], blobs: [])
        let transferID = context.deriveTransferID(contentID: contentID)
        var header = Foliole_Sync_V22_TransferHeader()
        header.transferID = transferID; header.attemptID = attemptID
        header.manifest.protocolVersion = 22; header.manifest.groupID = context.groupID
        header.manifest.contentID = contentID
        var declaration = Foliole_Sync_V22_FactDescriptor()
        declaration.identity = fact.identity; declaration.sharedStateHash = fact.sharedStateHash
        header.manifest.facts = [declaration]
        var trailer = Foliole_Sync_V22_TransferTrailer()
        trailer.transferID = transferID; trailer.manifestHash = contentID; trailer.factCount = 1
        let baseline = try FramedSyncRecoveryWire.transfer(context: context, contentID: contentID, transferID: transferID)
        let preamble = try FolioleFramedSyncPreamble(decoding: Data(baseline.prefix(96)))
        let output = OutputStream.toMemory(), writer = FolioleFramedSyncStreamWriter(output: output)
        try writer.write(preamble: preamble.encoded)
        let payloads: [Foliole_Sync_V22_ProtocolMessage.OneOf_Payload] = [.transferHeader(header)]
            + fragments.map { .factFragment($0) } + [.transferTrailer(trailer)]
        for (index, payload) in payloads.enumerated() {
            var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = payload
            let type: FolioleFramedSyncFrameType = index == 0 ? .transferHeader
                : index == payloads.count - 1 ? .transferTrailer : .fact
            let bytes = try FolioleFramedSyncCodec.encode(FolioleFramedSyncCodec.validateOutbound(message, authenticatedFrameType: type.rawValue))
            let frameHeader = try FolioleFramedSyncWireHeader(ciphertextBytes: bytes.count + 16, sequence: UInt64(index), frameType: type).encode()
            let cipher = try FolioleFramedSyncFrameCrypto.encrypt(groupKey: Data(0...31), preamble: preamble,
                header: frameHeader, plaintext: bytes, sequence: UInt64(index))
            try writer.write(header: frameHeader, ciphertext: cipher)
        }
        return try XCTUnwrap(output.property(forKey: .dataWrittenToMemoryStreamKey) as? Data)
    }

    private func prefix(_ wire: Data, frames: Int) throws -> Data {
        let reader = FolioleFramedSyncStreamReader(input: InputStream(data: wire))
        let preamble = try reader.nextPreamble()
        let output = OutputStream.toMemory(), writer = FolioleFramedSyncStreamWriter(output: output)
        try writer.write(preamble: preamble.encoded)
        for _ in 0..<frames {
            let frame = try XCTUnwrap(reader.nextFrame())
            try writer.write(header: frame.headerBytes, ciphertext: frame.ciphertext)
        }
        return try XCTUnwrap(output.property(forKey: .dataWrittenToMemoryStreamKey) as? Data)
    }
}
