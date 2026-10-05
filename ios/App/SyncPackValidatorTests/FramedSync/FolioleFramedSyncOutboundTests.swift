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
        let staging = try FolioleFramedSyncOutboundSQLite(database: database)
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

    func testMultiFactTransferAllowsRelationAndReviewWithoutBlobs() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-ios-multi-fact-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let staging = try FolioleFramedSyncOutboundSQLite(database: try .init(
            url: directory.appendingPathComponent("outbound.db")
        ))
        let facts = [
            bloblessFact(kind: .parentEdge, id: "[\"version-1\",\"version-0\",0]"),
            bloblessFact(kind: .review, id: "review-1")
        ]
        let attempt = try FolioleFramedSyncTransferWriter.prepare(
            groupKey: groupKey, context: context(), facts: facts, blobs: [], staging: staging
        )
        let wire = try FolioleFramedSyncTransferWriter.replay(attempt, staging: staging)
        let reader = FolioleFramedSyncStreamReader(input: InputStream(data: wire))
        _ = try reader.nextPreamble()
        var types = [FolioleFramedSyncFrameType]()
        while let frame = try reader.nextFrame() { types.append(frame.header.frameType) }
        XCTAssertEqual(types, [.transferHeader, .fact, .fact, .transferTrailer])
    }

    func testEmptyBodyBlobIsDeclaredButDoesNotEmitAnEmptyBlobChunk() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-ios-empty-body-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let staging = try FolioleFramedSyncOutboundSQLite(database: try .init(
            url: directory.appendingPathComponent("outbound.db")
        ))
        let body = Data()
        let fact = makeFact(body: body)
        let attempt = try FolioleFramedSyncTransferWriter.prepare(
            groupKey: groupKey, context: context(), facts: [fact],
            blobs: [.init(reference: fact.blobs[0], data: body)], staging: staging
        )
        let wire = try FolioleFramedSyncTransferWriter.replay(attempt, staging: staging)
        let reader = FolioleFramedSyncStreamReader(input: InputStream(data: wire))
        let preamble = try reader.nextPreamble()
        var types = [FolioleFramedSyncFrameType]()
        var trailer: Foliole_Sync_V22_TransferTrailer?
        var sequence: UInt64 = 0
        while let frame = try reader.nextFrame() {
            types.append(frame.header.frameType)
            let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(
                groupKey: groupKey, preamble: preamble, frame: frame,
                expectedSequence: sequence
            )
            let message = try FolioleFramedSyncCodec.decode(
                plaintext, authenticatedFrameType: frame.header.frameType.rawValue
            )
            if case .transferTrailer(let value) = message.payload { trailer = value }
            sequence += 1
        }
        XCTAssertEqual(types, [.transferHeader, .fact, .transferTrailer])
        XCTAssertEqual(trailer?.blobCount, 1)
    }

    func testPreparedOutboundRequiresTheNewFactListAndBlobListContract() throws {
        let fact = bloblessFact(kind: .review, id: "review-1")
        var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .fact(fact)
        let validated = try FolioleFramedSyncCodec.validateOutbound(
            message, authenticatedFrameType: FolioleFramedSyncFrameType.fact.rawValue
        )
        let bytes = try FolioleFramedSyncCodec.encode(validated)
        let digest = Data(repeating: 9, count: 32).hex
        let decoded = try FolioleCompanionFramedSyncPreparedOutbound.decode([
            "blobs": [[String: Any]](), "content_id": digest,
            "fact_message_bytes_list": [Array(bytes)], "manifest_hash": digest,
            "transfer_id": Data(repeating: 8, count: 32).hex
        ])
        XCTAssertEqual(decoded.facts.map(\.identity.factID), ["review-1"])
        XCTAssertTrue(decoded.blobs.isEmpty)
        XCTAssertThrowsError(try FolioleCompanionFramedSyncPreparedOutbound.decode([
            "blob": [String: Any](), "content_id": digest,
            "fact_message_bytes": Array(bytes), "manifest_hash": digest,
            "transfer_id": Data(repeating: 8, count: 32).hex
        ]))
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

    private func bloblessFact(
        kind: Foliole_Sync_V22_FactKind, id: String
    ) -> Foliole_Sync_V22_FactRecord {
        var identity = Foliole_Sync_V22_FactIdentity()
        identity.kind = kind; identity.objectType = "node"
        identity.globalID = "node-1"; identity.factID = id
        var fact = Foliole_Sync_V22_FactRecord()
        fact.identity = identity; fact.sharedStateHash = Data(repeating: UInt8(kind.rawValue), count: 32)
        fact.body = .init()
        return fact
    }
}
