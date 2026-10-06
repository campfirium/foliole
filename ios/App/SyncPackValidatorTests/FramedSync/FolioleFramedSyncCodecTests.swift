import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime

final class FolioleFramedSyncCodecTests: XCTestCase {
    func testCanonicalPayloadUsesItsOwnStringBudget() throws {
        let golden = try XCTUnwrap(try FramedSyncFixture.load().corpus.messages.first {
            $0.payloadCase == "fact"
        })
        var message = try Foliole_Sync_V22_ProtocolMessage(
            serializedBytes: XCTUnwrap(Data(base64Encoded: golden.base64)))
        var field = Foliole_Sync_V22_CanonicalField()
        field.name = "payload_json"
        for size in [65_537, 170_000, 1_048_577] {
            field.value.stringValue = String(repeating: "x", count: size)
            message.fact.body.fields = [field]
            if size > FolioleFramedSyncLimits.maxCanonicalStringBytes {
                XCTAssertThrowsError(try FolioleFramedSyncCodec.validateOutbound(message,
                    authenticatedFrameType: FolioleFramedSyncFrameType.fact.rawValue)) { error in
                    XCTAssertEqual((error as? FolioleFramedSyncValidationError)?.code,
                                   "canonical_string_limit_exceeded")
                }
            } else {
                let valid = try FolioleFramedSyncCodec.validateOutbound(message,
                    authenticatedFrameType: FolioleFramedSyncFrameType.fact.rawValue)
                let encoded = try FolioleFramedSyncCodec.encode(valid)
                XCTAssertEqual(try FolioleFramedSyncCodec.encode(FolioleFramedSyncCodec.decode(encoded,
                    authenticatedFrameType: FolioleFramedSyncFrameType.fact.rawValue)), encoded)
            }
        }
    }

    func testGoldenCorpusDecodesToValidatedCasesAndReencodesExactly() throws {
        let corpus = try FramedSyncFixture.load().corpus
        XCTAssertEqual(corpus.messages.count, 17)
        for golden in corpus.messages {
            let data = try XCTUnwrap(Data(base64Encoded: golden.base64), golden.name)
            let frameType = try frameType(for: golden.payloadCase)
            let validated = try FolioleFramedSyncCodec.decode(
                data,
                authenticatedFrameType: frameType.rawValue
            )
            XCTAssertEqual(validated.payload.corpusName, golden.payloadCase, golden.name)
            XCTAssertEqual(try FolioleFramedSyncCodec.encode(validated), data, golden.name)
        }
    }

    func testMaliciousCorpusFailsSemanticValidation() throws {
        let corpus = try FramedSyncFixture.loadMalicious()
        XCTAssertEqual(corpus.corpusVersion, 1)
        XCTAssertEqual(corpus.protocolVersion, 22)
        XCTAssertEqual(corpus.messages.count, 12)
        for malicious in corpus.messages {
            let data = try XCTUnwrap(Data(base64Encoded: malicious.base64), malicious.name)
            XCTAssertThrowsError(try FolioleFramedSyncCodec.decode(
                data,
                authenticatedFrameType: malicious.frameType
            ), malicious.name) { error in
                XCTAssertEqual(
                    (error as? FolioleFramedSyncValidationError)?.code,
                    malicious.expectedError,
                    malicious.name
                )
            }
        }
    }

    func testAcceptedCorpusCoversExactSemanticBoundaries() throws {
        let corpus = try FramedSyncFixture.loadMalicious()
        XCTAssertEqual(corpus.acceptedMessages.count, 3)
        for accepted in corpus.acceptedMessages {
            let data = try XCTUnwrap(Data(base64Encoded: accepted.base64), accepted.name)
            let validated = try FolioleFramedSyncCodec.decode(
                data,
                authenticatedFrameType: accepted.frameType
            )
            XCTAssertEqual(validated.payload.corpusName, accepted.payloadCase, accepted.name)
            XCTAssertEqual(try FolioleFramedSyncCodec.encode(validated), data, accepted.name)
        }
    }

    func testAuthenticatedFrameTypeMustMatchTheDecodedPayload() throws {
        let golden = try XCTUnwrap(try FramedSyncFixture.load().corpus.messages.first {
            $0.payloadCase == "fact"
        })
        let data = try XCTUnwrap(Data(base64Encoded: golden.base64))
        XCTAssertThrowsError(try FolioleFramedSyncCodec.decode(
            data,
            authenticatedFrameType: FolioleFramedSyncFrameType.transferHeader.rawValue
        )) { error in
            XCTAssertEqual(
                error as? FolioleFramedSyncValidationError,
                FolioleFramedSyncValidationError("frame_payload_type_mismatch")
            )
        }
    }

    func testOutboundMessagesMustValidateBeforeEncoding() throws {
        let golden = try XCTUnwrap(try FramedSyncFixture.load().corpus.messages.first {
            $0.payloadCase == "fact"
        })
        let data = try XCTUnwrap(Data(base64Encoded: golden.base64))
        let decoded = try Foliole_Sync_V22_ProtocolMessage(serializedBytes: data)
        let validated = try FolioleFramedSyncCodec.validateOutbound(
            decoded,
            authenticatedFrameType: FolioleFramedSyncFrameType.fact.rawValue
        )
        XCTAssertEqual(try FolioleFramedSyncCodec.encode(validated), data)

        var invalid = decoded
        invalid.fact.identity.kind = .unspecified
        XCTAssertThrowsError(try FolioleFramedSyncCodec.validateOutbound(
            invalid,
            authenticatedFrameType: FolioleFramedSyncFrameType.fact.rawValue
        )) { error in
            XCTAssertEqual(
                error as? FolioleFramedSyncValidationError,
                FolioleFramedSyncValidationError("fact_kind_invalid")
            )
        }
    }

    func testCanonicalTextMayBeEmptyWhileProtocolIdentitiesMayNot() throws {
        let golden = try XCTUnwrap(try FramedSyncFixture.load().corpus.messages.first {
            $0.payloadCase == "fact"
        })
        let data = try XCTUnwrap(Data(base64Encoded: golden.base64))
        var message = try Foliole_Sync_V22_ProtocolMessage(serializedBytes: data)
        var value = Foliole_Sync_V22_CanonicalValue()
        value.stringValue = ""
        var field = Foliole_Sync_V22_CanonicalField()
        field.name = "body"
        field.value = value
        message.fact.body.fields = [field]
        XCTAssertNoThrow(try FolioleFramedSyncCodec.validateOutbound(
            message,
            authenticatedFrameType: FolioleFramedSyncFrameType.fact.rawValue
        ))

        message.fact.identity.factID = ""
        XCTAssertThrowsError(try FolioleFramedSyncCodec.validateOutbound(
            message,
            authenticatedFrameType: FolioleFramedSyncFrameType.fact.rawValue
        )) { error in
            XCTAssertEqual(
                error as? FolioleFramedSyncValidationError,
                FolioleFramedSyncValidationError("protocol_string_required")
            )
        }
    }

    private func frameType(for payloadCase: String) throws -> FolioleFramedSyncFrameType {
        switch payloadCase {
        case "transfer_header": .transferHeader
        case "fact": .fact
        case "blob_chunk": .blobChunk
        case "transfer_trailer": .transferTrailer
        case "transfer_receipt": .transferReceipt
        case "handshake", "handshake_acceptance", "inventory_begin", "inventory_chunk",
             "inventory_end", "difference_request", "transfer_proposal", "blob_offer",
             "missing_blob_set", "round_receipt", "transfer_termination", "error":
            .sessionControl
        default: throw FolioleFramedSyncValidationError("protocol_payload_case_invalid")
        }
    }
}
