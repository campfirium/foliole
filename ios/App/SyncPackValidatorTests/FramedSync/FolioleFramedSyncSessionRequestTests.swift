import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncSessionRequestTests: XCTestCase {
    private let key = Data(repeating: 0, count: 32)
    private let round = Data(repeating: 7, count: 16)

    private func context(_ epoch: String = "eb") throws -> FolioleFramedSyncSessionContext {
        try .init(groupID: "group", initiatorDeviceID: "a", initiatorLibraryEpoch: "ea",
            responderDeviceID: "b", responderLibraryEpoch: epoch)
    }

    private func difference(_ objectID: String = "node-1", roundID: Data? = nil) throws -> FolioleFramedSyncValidatedMessage {
        try FolioleFramedSyncDifferenceRequest.make(roundID: roundID ?? round, objectID: objectID,
            frontierFactIDs: ["version-1"], requiredRelationIDs: [], resourceHashes: [], reviewFactIDs: [], stateFactIDs: [])
    }

    private func encode(_ messages: [FolioleFramedSyncValidatedMessage]) throws -> Data {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        return try FolioleFramedSyncSessionWriter.encode(groupKey: key, context: context(),
            messages: messages, nonceDirectory: directory)
    }

    private func read(_ bytes: Data) throws -> FolioleFramedSyncSessionRequest {
        try .read(InputStream(data: bytes), groupKey: key, context: context())
    }

    func testPreservesTheSingleAuthenticatedDifference() throws {
        let message = try difference()
        guard case .difference(let encoded) = try read(encode([message])) else {
            return XCTFail("expected difference")
        }
        XCTAssertEqual(encoded, try FolioleFramedSyncCodec.encode(message))
    }

    func testRequiresCompleteInventoryAndPreservesItsRound() throws {
        let messages = try FolioleFramedSyncInventoryWire.encode(entries: [], roundID: round)
        guard case .inventory(let roundID) = try read(encode(messages)) else {
            return XCTFail("expected inventory")
        }
        XCTAssertEqual(roundID, round)
        XCTAssertThrowsError(try read(encode(Array(messages.prefix(1)))))
        XCTAssertThrowsError(try read(encode([])))
    }

    func testRejectsDuplicateDifferenceAndBothMixedRequestOrders() throws {
        let message = try difference()
        XCTAssertThrowsError(try read(encode([message, message])))
        let inventory = try FolioleFramedSyncInventoryWire.encode(entries: [], roundID: round)
        XCTAssertThrowsError(try read(encode(inventory + [message])))
        XCTAssertThrowsError(try read(encode([message] + inventory)))
    }

    func testRejectsTamperingTruncationAndWrongContextBeforeDispatch() throws {
        var bytes = try encode([difference()])
        XCTAssertThrowsError(try read(Data(bytes.dropLast())))
        XCTAssertThrowsError(try FolioleFramedSyncSessionRequest.read(InputStream(data: bytes),
            groupKey: key, context: context("wrong")))
        bytes[bytes.count - 1] ^= 1
        XCTAssertThrowsError(try read(bytes))
    }

    func testReadsDistinctSameRoundRequestsOnlyAfterAuthenticatedEOF() throws {
        let messages = try [difference(), difference("node-2")]
        let bytes = try encode(messages)
        guard case .differences(let values) = try read(bytes) else { return XCTFail("expected batch") }
        XCTAssertEqual(values, try messages.map(FolioleFramedSyncCodec.encode))
        XCTAssertThrowsError(try read(Data(bytes.dropLast())))
        XCTAssertThrowsError(try read(encode([difference(), difference("node-2", roundID: Data(repeating: 8, count: 16))])))
        XCTAssertThrowsError(try read(encode((0..<129).map { try difference("node-\($0)") })))
    }

    func testCountsAuthenticatedPlaintextRatherThanCanonicalReencoding() throws {
        func stream(_ count: Int) throws -> Data {
            var bytes = try encode([])
            let preamble = try FolioleFramedSyncPreamble(decoding: bytes)
            for index in 0..<count {
                // Repeated overwritten oneof fields are legal protobuf but disappear on reencoding.
                let padding = Data(repeating: 0, count: 210_000)
                var plaintext = Data()
                for offset in stride(from: 0, to: padding.count, by: 2) {
                    plaintext.append(contentsOf: [10, padding[offset]])
                }
                plaintext += try FolioleFramedSyncCodec.encode(difference("node-\(index)"))
                let header = try FolioleFramedSyncWireHeader(ciphertextBytes: plaintext.count + 16,
                    sequence: UInt64(index), frameType: .sessionControl).encode()
                bytes += header
                bytes += try FolioleFramedSyncFrameCrypto.encrypt(groupKey: key,
                    preamble: preamble, header: header, plaintext: plaintext, sequence: UInt64(index))
            }
            return bytes
        }
        guard case .differences = try read(stream(2)) else { return XCTFail("expected prefix") }
        XCTAssertThrowsError(try read(stream(4)))
    }
}
