import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncSessionTests: XCTestCase {
    func testFrozenSessionVectorAuthenticatesWithCanonicalPeerContext() throws {
        let context = try FolioleFramedSyncSessionContext(
            groupID: "group-a", initiatorDeviceID: "device-a", initiatorLibraryEpoch: "epoch-a",
            responderDeviceID: "device-b", responderLibraryEpoch: "epoch-b"
        )
        let sessionID = try Data(hex: "00112233445566778899aabbccddeeff")
        XCTAssertEqual(
            context.deriveContextID(sessionID: sessionID).hex,
            "b91385f313c79240f0d205a2c74a2e23c18773b07a39c6e016c57aef8d000baf"
        )
        let preamble = try FolioleFramedSyncPreamble(decoding: Data(hex: """
            464f4c53594e43320060001601000000b91385f313c79240f0d205a2c74a2e23
            c18773b07a39c6e016c57aef8d000baf00112233445566778899aabbccddeeff
            0506070800000000000000000000000000000000000000000000000000000000
            """))
        let headerBytes = try Data(hex: "0000001e000000000000000000010000")
        let frame = FolioleFramedSyncWireFrame(
            header: try .init(decoding: headerBytes), headerBytes: headerBytes,
            ciphertext: try Data(hex: "88f392bc50b6f68cdfff1040146ef627cbdf6c05ca8b1be83a40fa1309f1")
        )
        let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(
            groupKey: Data(0...31), preamble: preamble, frame: frame, expectedSequence: 0
        )
        XCTAssertEqual(String(data: plaintext, encoding: .utf8), "session-vector")
    }

    func testInventorySessionRoundTripsAndPersistsNonceBeforeEncryption() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-framed-session-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let context = try FolioleFramedSyncSessionContext(
            groupID: "group-a", initiatorDeviceID: "ios-a", initiatorLibraryEpoch: "epoch-a",
            responderDeviceID: "desktop-b", responderLibraryEpoch: "epoch-b"
        )
        let roundID = Data(repeating: 7, count: 16)
        let entries = try FolioleCompanionFramedSyncInventory.read(["entries": [[
            "object_type": "node", "global_id": "node-1",
            "shared_state_hash": String(repeating: "11", count: 32),
            "frontier_fact_ids": ["version-1"], "required_relation_ids": [String](),
            "review_fact_ids": [String](), "state_fact_ids": [String](), "resource_hashes": [String]()
        ]]])
        let wire = try FolioleFramedSyncSessionWriter.encode(
            groupKey: Data(0...31), context: context,
            messages: try FolioleFramedSyncInventoryWire.encode(entries: entries, roundID: roundID),
            nonceDirectory: directory
        )
        let decoded = try FolioleFramedSyncSessionReader.read(
            wire, groupKey: Data(0...31), context: context,
            maximumFrames: FolioleFramedSyncInventoryWire.maximumSessionFrames
        )
        XCTAssertEqual(try FolioleFramedSyncInventoryWire.decodeRoundID(decoded.messages), roundID)
        XCTAssertEqual(try FolioleFramedSyncInventoryWire.decodeEntries(decoded.messages)[0].globalID, "node-1")
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: directory.appendingPathComponent(decoded.sessionID.hex).path
        ))
    }

    func testDifferenceRequestKeepsRoundAndRequestsOnlyNodeFactsAndBlobs() throws {
        let roundID = Data(repeating: 7, count: 16)
        let message = try FolioleFramedSyncDifferenceRequest.make(
            roundID: roundID, objectID: "node-1",
            frontierFactIDs: ["version-2"], requiredRelationIDs: ["edge-1"],
            resourceHashes: [Data(repeating: 8, count: 32)], reviewFactIDs: ["review-1"], stateFactIDs: ["node_reading:" + String(repeating: "ab", count: 32)]
        )
        let encoded = try FolioleFramedSyncCodec.encode(message)
        let decoded = try FolioleFramedSyncCodec.decode(
            encoded, authenticatedFrameType: FolioleFramedSyncFrameType.sessionControl.rawValue
        )
        guard case .differenceRequest(let request) = decoded.payload else {
            return XCTFail("expected difference request")
        }
        XCTAssertEqual(request.roundID, roundID)
        XCTAssertEqual(request.facts.map(\.objectType), ["node", "node", "node", "node"])
        XCTAssertEqual(request.facts.map(\.globalID), ["node-1", "node-1", "node-1", "node-1"])
        XCTAssertEqual(request.facts.map(\.factID), ["version-2", "edge-1", "review-1", "node_reading:" + String(repeating: "ab", count: 32)])
        XCTAssertEqual(request.facts.map(\.kind), [.nodeVersion, .parentEdge, .review, .objectState])
        XCTAssertEqual(request.blobHashes, [Data(repeating: 8, count: 32)])
    }

    func testDifferenceRequestRejectsInvalidRoundAndBlobWidths() throws {
        XCTAssertThrowsError(try FolioleFramedSyncDifferenceRequest.make(
            roundID: Data(repeating: 1, count: 15), objectID: "node-1",
            frontierFactIDs: ["version-1"], requiredRelationIDs: [],
            resourceHashes: [], reviewFactIDs: [], stateFactIDs: []
        ))
        XCTAssertThrowsError(try FolioleFramedSyncDifferenceRequest.make(
            roundID: Data(repeating: 1, count: 16), objectID: "node-1",
            frontierFactIDs: ["version-1"], requiredRelationIDs: [],
            resourceHashes: [Data(repeating: 2, count: 31)], reviewFactIDs: [], stateFactIDs: []
        ))
    }

    func testHTTPParserPreservesBinaryFramedBody() throws {
        let body = Data([0, 255, 1, 254])
        let head = "POST /companion/framed-sync HTTP/1.1\r\n" +
            "Content-Type: application/vnd.foliole.framed-sync\r\n" +
            "Content-Length: \(body.count)\r\n\r\n"
        let request = try FolioleCompanionHttpMessage.parse(Data(head.utf8) + body)
        XCTAssertEqual(request.bodyData, body)
        XCTAssertTrue(request.body.isEmpty)
    }

    func testDecodesSharedActiveDatabaseInventory() throws {
        let entries = try FolioleCompanionFramedSyncInventory.read(["entries": [[
            "object_type": "node", "global_id": "node-1",
            "shared_state_hash": String(repeating: "11", count: 32),
            "frontier_fact_ids": ["version-1"],
            "required_relation_ids": ["[\"version-1\",\"version-0\",2]"],
            "review_fact_ids": ["review-1"], "state_fact_ids": ["node_reading:" + String(repeating: "ab", count: 32)],
            "resource_hashes": [String(repeating: "22", count: 32)]
        ]]])

        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries[0].frontierFactIds, ["version-1"])
        XCTAssertEqual(entries[0].requiredRelationIds, ["[\"version-1\",\"version-0\",2]"])
        XCTAssertEqual(entries[0].reviewFactIds, ["review-1"])
        XCTAssertEqual(entries[0].stateFactIds, ["node_reading:" + String(repeating: "ab", count: 32)])
    }
    func testInventoryPreserves4097And10000Entries() throws {
        for count in [4097, 10000] {
            let entries = (0..<count).map { index in
                var entry = Foliole_Sync_V22_InventoryEntry()
                entry.objectType = "node"
                entry.globalID = "node-\(index)"
                entry.sharedStateHash = Data(repeating: 1, count: 32)
                entry.frontierFactIds = ["version-\(index)"]
                entry.stateFactIds = ["node_reading:\(index)"]
                return entry
            }
            let messages = try FolioleFramedSyncInventoryWire.encode(
                entries: entries, roundID: Data(repeating: 3, count: 16))
            XCTAssertEqual(try FolioleFramedSyncInventoryWire.decodeEntries(messages), entries)
        }
    }

}

private extension Data {
    init(hex value: String) throws {
        let value = value.filter { !$0.isWhitespace }
        guard value.count.isMultiple(of: 2) else {
            throw FolioleFramedSyncValidationError("test_hex_invalid")
        }
        self.init(capacity: value.count / 2)
        for offset in stride(from: 0, to: value.count, by: 2) {
            let start = value.index(value.startIndex, offsetBy: offset)
            let end = value.index(start, offsetBy: 2)
            guard let byte = UInt8(value[start..<end], radix: 16) else {
                throw FolioleFramedSyncValidationError("test_hex_invalid")
            }
            append(byte)
        }
    }

    var hex: String { map { String(format: "%02x", $0) }.joined() }
}
