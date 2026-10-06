import Foundation
import SwiftProtobuf
import XCTest
@testable import FolioleFramedSyncRuntime

final class FramedSyncContractTests: XCTestCase {
    private let messageNames = [
        "handshake": "handshake",
        "handshake_acceptance": "handshake-acceptance",
        "inventory_begin": "inventory-begin",
        "inventory_chunk": "inventory-chunk",
        "inventory_end": "inventory-end",
        "difference_request": "difference-request",
        "transfer_proposal": "transfer-proposal",
        "blob_offer": "blob-offer",
        "missing_blob_set": "missing-blob-set",
        "transfer_header": "transfer-header",
        "fact": "fact",
        "blob_chunk": "blob-chunk",
        "transfer_trailer": "transfer-trailer",
        "transfer_receipt": "transfer-receipt",
        "round_receipt": "round-receipt",
        "transfer_termination": "transfer-termination",
        "error": "protocol-error"
    ]

    func testCorpusIsBoundToTheOnlyFramedSyncProto() throws {
        let fixture = try FramedSyncFixture.load()
        XCTAssertEqual(fixture.corpus.corpusVersion, 1)
        XCTAssertEqual(fixture.corpus.protocolVersion, 22)
        XCTAssertEqual(FramedSyncFixture.sha256Hex(fixture.proto), fixture.corpus.schemaSha256)

        let pluginProto = fixture.root.appendingPathComponent(
            "ios/App/SyncPackValidatorTests/FramedSync/framed_sync.proto"
        )
        let canonicalProto = fixture.root.appendingPathComponent(FramedSyncFixture.protoRelativePath)
        XCTAssertEqual(pluginProto.resolvingSymlinksInPath(), canonicalProto)

        let protoRoot = fixture.root.appendingPathComponent("lib/core/sync/proto")
        let candidates = try FileManager.default.subpathsOfDirectory(atPath: protoRoot.path)
            .filter { ($0 as NSString).lastPathComponent == "framed_sync.proto" }
        XCTAssertEqual(candidates, ["foliole/sync/v22/framed_sync.proto"])
    }

    func testGoldenMessagesCoverTheProtocolPayloadOneofAndHaveCanonicalWireBytes() throws {
        let fixture = try FramedSyncFixture.load()
        let fields = try FramedSyncProtoContract.payloadFields(in: fixture.proto)
        let declaredMessages = try FramedSyncProtoContract.declaredMessages(in: fixture.proto)
        XCTAssertEqual(fields.map(\.fieldNumber), Array(1...17))
        XCTAssertTrue(fields.allSatisfy { declaredMessages.contains($0.messageType) })

        let fieldsByName = Dictionary(uniqueKeysWithValues: fields.map { ($0.fieldName, $0) })
        XCTAssertEqual(Set(fieldsByName.keys), Set(fixture.corpus.messages.map(\.payloadCase)))
        XCTAssertEqual(Set(fieldsByName.keys), Set(messageNames.keys))
        XCTAssertEqual(fixture.corpus.messages.count, fields.count)

        for message in fixture.corpus.messages {
            let bytes = try XCTUnwrap(Data(base64Encoded: message.base64), message.name)
            XCTAssertEqual(bytes.count, message.byteLength, message.name)
            XCTAssertEqual(bytes.base64EncodedString(), message.base64, message.name)
            XCTAssertEqual(message.name, messageNames[message.payloadCase], message.payloadCase)
            let decoded = try Foliole_Sync_V22_ProtocolMessage(serializedBytes: bytes)
            XCTAssertEqual(decoded.payload?.corpusName, message.payloadCase, message.name)
            XCTAssertEqual(try decoded.serializedData(), bytes, message.name)
        }
    }

    func testEveryMaliciousFrameHeaderFailsClosed() throws {
        let corpus = try FramedSyncFixture.load().corpus
        XCTAssertEqual(
            Set(corpus.malformed.map(\.name)),
            [
                "wire-frame-length-over-decoded-frame-and-tag",
                "wire-frame-length-u32-max",
                "unspecified-frame-type",
                "nonzero-frame-flags"
            ]
        )
        let expectedErrors: [String: FrameHeaderError] = [
            "wire-frame-length-over-decoded-frame-and-tag": .ciphertextLimitExceeded,
            "wire-frame-length-u32-max": .ciphertextLimitExceeded,
            "unspecified-frame-type": .invalidHeader,
            "nonzero-frame-flags": .invalidHeader
        ]
        for malformed in corpus.malformed {
            let bytes = try XCTUnwrap(Data(strictHex: malformed.hex), malformed.name)
            XCTAssertThrowsError(try FramedSyncFrameHeader.decode(bytes), malformed.name) { error in
                XCTAssertEqual(error as? FrameHeaderError, expectedErrors[malformed.name])
            }
        }
    }
}

private extension Foliole_Sync_V22_ProtocolMessage.OneOf_Payload {
    var corpusName: String {
        switch self {
        case .handshake: "handshake"
        case .handshakeAcceptance: "handshake_acceptance"
        case .inventoryBegin: "inventory_begin"
        case .inventoryChunk: "inventory_chunk"
        case .inventoryEnd: "inventory_end"
        case .differenceRequest: "difference_request"
        case .transferProposal: "transfer_proposal"
        case .blobOffer: "blob_offer"
        case .missingBlobSet: "missing_blob_set"
        case .transferHeader: "transfer_header"
        case .fact: "fact"
        case .blobChunk: "blob_chunk"
        case .transferTrailer: "transfer_trailer"
        case .transferReceipt: "transfer_receipt"
        case .roundReceipt: "round_receipt"
        case .transferTermination: "transfer_termination"
        case .error: "error"
        }
    }
}
