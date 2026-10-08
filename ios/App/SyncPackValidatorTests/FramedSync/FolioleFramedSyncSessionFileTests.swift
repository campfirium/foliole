import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncSessionFileTests: XCTestCase {
    func testLargestStableInventoryPrefixAndImmediateTail() throws {
        try assertInventoryPages(count: 7, lengths: [6, 1])
    }

    func testThreeFullInventoryPages() throws {
        try assertInventoryPages(count: 18, lengths: [6, 6, 6])
    }

    func testInventoryGreedyBoundaryWithUnequalEntrySizes() throws {
        let frontier = (0..<3000).map { "version-\($0)-" + String(repeating: "v", count: 230) }
        let entries = (0..<8).map { index in
            var entry = Foliole_Sync_V22_InventoryEntry()
            entry.objectType = "node"
            entry.globalID = "node-\(index)"
            entry.sharedStateHash = Data(repeating: 0, count: 32)
            entry.frontierFactIds = index < 4 ? ["version-\(index)"] : frontier
            return entry
        }
        let messages = try FolioleFramedSyncInventoryWire.encode(
            entries: entries, roundID: Data(repeating: 7, count: 16))
        let lengths = messages.compactMap { message -> Int? in
            guard case .inventoryChunk(let chunk) = message.payload else { return nil }
            return chunk.entries.count
        }
        XCTAssertEqual(lengths, [5, 1, 1, 1])
        for message in messages {
            XCTAssertLessThanOrEqual(try FolioleFramedSyncCodec.encode(message).count,
                                     FolioleFramedSyncLimits.maxControlMessageBytes)
        }
        XCTAssertEqual(try FolioleFramedSyncInventoryWire.decodeEntries(messages), entries)
    }

    private func assertInventoryPages(count: Int, lengths: [Int]) throws {
        let frontier = (0..<900).map { "version-\($0)-" + String(repeating: "v", count: 125) }
        let entries = (0..<count).map { index in
            var entry = Foliole_Sync_V22_InventoryEntry()
            entry.objectType = "node"
            entry.globalID = "node-\(index)"
            entry.sharedStateHash = Data(repeating: 0, count: 32)
            entry.frontierFactIds = frontier
            return entry
        }
        let roundID = Data(repeating: 7, count: 16)
        let messages = try FolioleFramedSyncInventoryWire.encode(entries: entries, roundID: roundID)
        let chunks = messages.compactMap { message -> Foliole_Sync_V22_InventoryChunk? in
            guard case .inventoryChunk(let value) = message.payload else { return nil }
            return value
        }
        XCTAssertEqual(chunks.map { $0.entries.count }, lengths)
        for message in messages {
            XCTAssertLessThanOrEqual(try FolioleFramedSyncCodec.encode(message).count,
                                     FolioleFramedSyncLimits.maxControlMessageBytes)
        }
        XCTAssertEqual(try FolioleFramedSyncInventoryWire.decodeRoundID(messages), roundID)
        XCTAssertEqual(try FolioleFramedSyncInventoryWire.decodeEntries(messages), entries)
    }

    func testIncrementalInventoryRejectsIncompleteAndRepeatedFrames() throws {
        let round = Data(repeating: 7, count: 16)
        let messages = try FolioleFramedSyncInventoryWire.encode(entries: [], roundID: round)
        let truncated = FolioleFramedSyncInventoryWire.Reader(retainEntries: false)
        try truncated.accept(messages[0])
        XCTAssertThrowsError(try truncated.roundID())
        XCTAssertThrowsError(try truncated.accept(messages[0]))
        let complete = FolioleFramedSyncInventoryWire.Reader(retainEntries: true)
        for message in messages { try complete.accept(message) }
        XCTAssertThrowsError(try complete.result(expectedRoundID: Data(repeating: 8, count: 16)))
        XCTAssertThrowsError(try complete.accept(messages[1]))
    }

    func testFileWriterPreservesTenThousandInventoryEntriesAndDurableNonce() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-session-file-test-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("request.body")
        let nonces = directory.appendingPathComponent("nonces")
        let context = try FolioleFramedSyncSessionContext(groupID: "group-a", initiatorDeviceID: "a",
            initiatorLibraryEpoch: "ea", responderDeviceID: "b", responderLibraryEpoch: "eb")
        let entries = (0..<10000).map { index in
            var value = Foliole_Sync_V22_InventoryEntry()
            value.objectType = "node"
            value.globalID = "node-\(index)"
            value.sharedStateHash = Data(repeating: 1, count: 32)
            value.frontierFactIds = ["version-\(index)"]
            return value
        }
        let roundID = Data(repeating: 7, count: 16)
        try FolioleFramedSyncSessionWriter.writeFile(to: url, groupKey: Data(0...31),
            context: context, nonceDirectory: nonces) { emit in
            XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: nonces.path).count, 1)
            try FolioleFramedSyncInventoryWire.emit(entries: entries, roundID: roundID, consume: emit)
        }
        let input = try XCTUnwrap(InputStream(url: url))
        let decoded = try FolioleFramedSyncSessionReader.read(input, groupKey: Data(0...31),
            context: context, maximumFrames: FolioleFramedSyncLimits.maxSessionFrames)
        XCTAssertEqual(try FolioleFramedSyncInventoryWire.decodeRoundID(decoded.messages), roundID)
        XCTAssertEqual(try FolioleFramedSyncInventoryWire.decodeEntries(decoded.messages), entries)
        let inventory = FolioleFramedSyncInventoryWire.Reader(retainEntries: true)
        let streamed = try FolioleFramedSyncSessionReader.readEach(try XCTUnwrap(InputStream(url: url)),
            groupKey: Data(0...31), context: context,
            maximumFrames: FolioleFramedSyncLimits.maxSessionFrames, consume: inventory.accept)
        XCTAssertTrue(streamed.messages.isEmpty)
        XCTAssertEqual(try inventory.result(expectedRoundID: roundID), entries)
        let responder = FolioleFramedSyncInventoryWire.Reader(retainEntries: false)
        for message in decoded.messages { try responder.accept(message) }
        XCTAssertEqual(try responder.roundID(), roundID)
    }

    func testProducerFailureRemovesPartialFileAndPreservesItsError() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-session-file-failure-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("request.body")
        let context = try FolioleFramedSyncSessionContext(groupID: "group-a", initiatorDeviceID: "a",
            initiatorLibraryEpoch: "ea", responderDeviceID: "b", responderLibraryEpoch: "eb")
        XCTAssertThrowsError(try FolioleFramedSyncSessionWriter.writeFile(to: url, groupKey: Data(0...31),
            context: context, nonceDirectory: directory.appendingPathComponent("nonces")) { _ in
            throw NSError(domain: "source-failed", code: 42)
        }) { error in
            XCTAssertEqual((error as NSError).domain, "source-failed")
            XCTAssertEqual((error as NSError).code, 42)
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    }
}
