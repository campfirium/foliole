import CryptoKit
import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncBoundedOutboundTests: XCTestCase {
    func testOneLargeAndOneSmallFactFreezeOncePreserveOriginalBytesAndReopenReady() throws {
        try FramedSyncWholeBodyReceiverFixture.withRoot { root in
            let facts = [fact(id: "version-z", large: true), fact(id: "version-a", large: false)]
            let prepared = try prepared(facts)
            let messages = try facts.map(encodedMessages)
            var calls = [(Int, Int)](), reading = false
            let source = FolioleFramedSyncOutboundFactSource(header: prepared.header, directory: root) { index, fragment, consume in
                XCTAssertFalse(reading)
                reading = true
                defer { reading = false }
                calls.append((index, fragment))
                XCTAssertTrue(messages[index].indices.contains(fragment))
                try consume(messages[index][fragment], fragment == messages[index].count - 1)
            }
            let senderURL = root.appendingPathComponent("sender.db")
            let staging = try FolioleFramedSyncOutboundSQLite(database: .init(url: senderURL))
            let attempt = try FolioleFramedSyncTransferWriter.prepare(groupKey: key, context: context,
                prepared: prepared, source: source, staging: staging)
            XCTAssertEqual(attempt.transferID, prepared.transferID)
            XCTAssertEqual(calls.map { "\($0.0):\($0.1)" }, ["1:0"] + messages[0].indices.map { "0:\($0)" })
            let wire = try FolioleFramedSyncTransferWriter.replay(attempt, staging: staging)
            XCTAssertEqual(try factPlaintexts(wire), messages[1] + messages[0])
            let reopenedSource = try FolioleFramedSyncOutboundSQLite(database: .init(url: senderURL))
            XCTAssertEqual(try FolioleFramedSyncTransferWriter.replay(attempt, staging: reopenedSource), wire)
            let database = try FolioleFramedSyncTransferDatabase(url: root.appendingPathComponent("receiver.db"))
            let receiver = FolioleFramedSyncTransferReceiver(database: database, resourceRoot: root)
            XCTAssertEqual(try receiver.receive(wire, groupKey: key, context: context).transferID, prepared.transferID)
            XCTAssertEqual(try database.rows("SELECT state FROM framed_sync_ios_transfers").first?[0] as? String, "ready_to_apply")
            let restored = try FolioleFramedSyncDurableFactReader.read(database: database,
                transferID: prepared.transferID, attemptID: attempt.attemptID, firstSequence: 2)
            XCTAssertEqual(restored, facts[0])
        }
    }

    func testTruncatedOrChangedSourceCannotPrepareReplayableAttempt() throws {
        for fault in ["truncated", "identity", "last"] {
            try FramedSyncWholeBodyReceiverFixture.withRoot { root in
                let facts = [fact(id: "version", large: true)]
                let prepared = try prepared(facts)
                let messages = try encodedMessages(facts[0])
                let source = FolioleFramedSyncOutboundFactSource(header: prepared.header, directory: root) { _, index, consume in
                    if fault == "truncated", index == 1 { throw FolioleFramedSyncValidationError("source_truncated") }
                    var bytes = messages[index]
                    if fault == "identity", index == 1 {
                        var value = try Foliole_Sync_V22_ProtocolMessage(serializedBytes: bytes)
                        value.factFragment.identity.factID = "changed-version"
                        bytes = try value.serializedData()
                    }
                    try consume(bytes, fault == "last" ? true : index == messages.count - 1)
                }
                let database = try FolioleFramedSyncTransferDatabase(url: root.appendingPathComponent("sender.db"))
                let staging = try FolioleFramedSyncOutboundSQLite(database: database)
                XCTAssertThrowsError(try FolioleFramedSyncTransferWriter.prepare(groupKey: key, context: context,
                    prepared: prepared, source: source, staging: staging))
                XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_outbound_attempts").count, 0)
                XCTAssertEqual(try database.rows("SELECT 1 FROM framed_sync_ios_outbound_file_frames").count, 0)
            }
        }
    }

    func testHeaderAndContextMismatchRejectBeforeReadingFactPayloads() throws {
        try FramedSyncWholeBodyReceiverFixture.withRoot { root in
            let prepared = try prepared([fact(id: "version", large: false)])
            let source = FolioleFramedSyncOutboundFactSource(header: prepared.header, directory: root) { _, _, _ in
                XCTFail("Do not read a fact outside its original participant context")
            }
            let staging = try FolioleFramedSyncOutboundSQLite(database: .init(url: root.appendingPathComponent("sender.db")))
            let changed = FolioleFramedSyncTransferContext(groupID: context.groupID, senderDeviceID: "other",
                senderLibraryEpoch: context.senderLibraryEpoch, receiverDeviceID: context.receiverDeviceID,
                receiverLibraryEpoch: context.receiverLibraryEpoch)
            XCTAssertThrowsError(try FolioleFramedSyncTransferWriter.prepare(groupKey: key, context: changed,
                prepared: prepared, source: source, staging: staging))
        }
    }

    private let key = Data(0...31)
    private let context = FolioleFramedSyncTransferContext(groupID: "group", senderDeviceID: "sender",
        senderLibraryEpoch: "s", receiverDeviceID: "receiver", receiverLibraryEpoch: "r")

    private func prepared(_ facts: [Foliole_Sync_V22_FactRecord]) throws -> FolioleCompanionFramedSyncPreparedOutbound {
        let contentID = try FolioleFramedSyncCanonicalManifest.contentID(facts: facts, blobs: [])
        let transferID = context.deriveTransferID(contentID: contentID)
        return try FolioleCompanionFramedSyncPreparedOutbound.decode([
            "content_id": contentID.hex, "manifest_hash": contentID.hex, "transfer_id": transferID.hex,
            "header_message_bytes": try FramedSyncPreparedOutboundFixture.headerBytes(facts: facts,
                contentID: contentID, transferID: transferID, groupID: context.groupID), "blobs": [[String: Any]]()
        ])
    }

    private func fact(id: String, large: Bool) -> Foliole_Sync_V22_FactRecord {
        var value = Foliole_Sync_V22_FactRecord()
        value.identity.kind = .nodeVersion; value.identity.objectType = "node"
        value.identity.globalID = "node-1"; value.identity.factID = id
        value.sharedStateHash = Data(repeating: 7, count: 32)
        value.body.fields = ["first", "second"].map { name in
            var field = Foliole_Sync_V22_CanonicalField(); field.name = name
            field.value.value = .stringValue(String(repeating: "a", count: large ? 1100 * 1024 : 5))
            return field
        }
        return value
    }

    private func encodedMessages(_ fact: Foliole_Sync_V22_FactRecord) throws -> [Data] {
        var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .fact(fact)
        let bytes = try message.serializedData()
        if bytes.count <= FolioleFramedSyncLimits.maxFrameMessageBytes { return [bytes] }
        let digest = Data(SHA256.hash(data: bytes))
        return try stride(from: 0, to: bytes.count, by: 512 * 1024).map { offset in
            var fragment = Foliole_Sync_V22_FactFragment()
            fragment.identity = fact.identity; fragment.sharedStateHash = fact.sharedStateHash
            fragment.encodedSha256 = digest; fragment.totalByteLength = UInt64(bytes.count)
            fragment.offset = UInt64(offset); fragment.data = bytes.subdata(in: offset..<min(bytes.count, offset + 512 * 1024))
            var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .factFragment(fragment)
            return try message.serializedData()
        }
    }

    private func factPlaintexts(_ wire: Data) throws -> [Data] {
        let reader = FolioleFramedSyncStreamReader(input: InputStream(data: wire))
        let preamble = try reader.nextPreamble()
        var result = [Data](), sequence: UInt64 = 0
        while let frame = try reader.nextFrame() {
            let bytes = try FolioleFramedSyncFrameCrypto.decrypt(groupKey: key, preamble: preamble,
                frame: frame, expectedSequence: sequence)
            if frame.header.frameType == .fact { result.append(bytes) }
            sequence += 1
        }
        return result
    }
}
