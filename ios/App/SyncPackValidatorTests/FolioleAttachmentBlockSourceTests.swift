import CryptoKit
import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleAttachmentBlockSourceTests: XCTestCase {
    func testBatchPresenceRechecksFilesAndBoundsRequests() throws {
        let fixture = try AttachmentBlockStorageFixture()
        defer { fixture.close() }
        let keys = [fixture.key, String(repeating: "b", count: 64) + ".png"]
        let file = fixture.root.appendingPathComponent(fixture.key)
        try Data([1, 2, 3]).write(to: file)
        XCTAssertEqual(try fixture.storage.execute(action: "source-stat-batch", key: "", keys: keys)["presence"] as? [Bool], [true, false])
        try FileManager.default.removeItem(at: file)
        XCTAssertEqual(try fixture.storage.execute(action: "source-stat-batch", key: "", keys: keys)["presence"] as? [Bool], [false, false])
        XCTAssertThrowsError(try fixture.storage.execute(action: "source-stat-batch", key: "", keys: Array(repeating: fixture.key, count: 65)))
        XCTAssertThrowsError(try fixture.storage.execute(action: "source-stat-batch", key: "", keys: [String(repeating: "a", count: 16385)]))
        XCTAssertThrowsError(try fixture.storage.execute(action: "source-stat-batch", key: "", keys: ["../escape"]))
    }

    func testReadsExactRangesFromAssetsAndTrashAndCloseReleasesSource() throws {
        let fixture = try AttachmentBlockStorageFixture()
        defer { fixture.close() }
        let bytes = Data(repeating: 0x31, count: 524288) + Data([0x42, 0x43, 0x44])
        for directory in [fixture.root, fixture.trash] {
            let file = directory.appendingPathComponent(fixture.key)
            try bytes.write(to: file)
            let presence = try fixture.call("source-stat")
            XCTAssertEqual(presence["hash"] as? String, "")
            XCTAssertEqual(presence["length"] as? Int, bytes.count)
            XCTAssertEqual(try fixture.call("source-open")["hash"] as? String,
                           AttachmentBlockStorageFixture.hash(bytes))
            XCTAssertTrue(fixture.storage.isSending(fixture.key))
            XCTAssertThrowsError(try fixture.call("source-open"))
            let tail = try fixture.call("source-read", numbers: ["offset": 524288, "length": 3])
            XCTAssertEqual(tail["base64"] as? String, Data(bytes.suffix(3)).base64EncodedString())
            XCTAssertThrowsError(try fixture.call("source-read", numbers: ["offset": 524288, "length": 4]))
            XCTAssertThrowsError(try fixture.call("source-read", numbers: ["offset": 0, "length": 524289]))
            try fixture.call("source-close")
            XCTAssertFalse(fixture.storage.isSending(fixture.key))
            XCTAssertThrowsError(try fixture.call("source-read", numbers: ["offset": 0, "length": 1]))
            try FileManager.default.removeItem(at: file)
        }
        XCTAssertEqual(try fixture.call("source-open")["present"] as? Bool, false)
        XCTAssertFalse(fixture.storage.isSending(fixture.key))
    }

    func testCloseDropsAllSourceHandlesAndReopenReadsPublishedFile() throws {
        let fixture = try AttachmentBlockStorageFixture()
        defer { fixture.close() }
        try Data([7]).write(to: fixture.published)
        try fixture.call("source-open")
        fixture.storage.close()
        XCTAssertFalse(fixture.storage.isSending(fixture.key))
        XCTAssertThrowsError(try fixture.call("source-read", numbers: ["offset": 0, "length": 1]))
        let reopened = try FolioleAttachmentBlockStorage(root: fixture.root, trash: { fixture.trash })
        defer { reopened.close() }
        XCTAssertEqual(try reopened.execute(action: "source-open", key: fixture.key)["length"] as? Int, 1)
    }

    func testRejectsSourceSymlinksAndDirectoriesInAssetsAndTrash() throws {
        let fixture = try AttachmentBlockStorageFixture()
        defer { fixture.close() }
        let outside = fixture.directory.appendingPathComponent("original")
        try Data([1, 2, 3]).write(to: outside)
        for directory in [fixture.root, fixture.trash] {
            let file = directory.appendingPathComponent(fixture.key)
            try FileManager.default.createSymbolicLink(at: file, withDestinationURL: outside)
            XCTAssertThrowsError(try fixture.call("source-open"))
            XCTAssertThrowsError(try fixture.call("source-stat"))
            try FileManager.default.removeItem(at: file)
            try FileManager.default.createDirectory(at: file, withIntermediateDirectories: true)
            XCTAssertThrowsError(try fixture.call("source-open"))
            try FileManager.default.removeItem(at: file)
        }
        XCTAssertEqual(try Data(contentsOf: outside), Data([1, 2, 3]))
    }

    func testStreamsThreeHundredMiBWithoutWholeFileBuffers() throws {
        let fixture = try AttachmentBlockStorageFixture()
        defer { fixture.close() }
        let block = Data(repeating: 0x5a, count: 524288)
        var expected = SHA256()
        for index in 0..<600 {
            try autoreleasepool {
                try fixture.call("append", numbers: ["offset": Double(index * block.count)], bytes: block)
                expected.update(data: block)
            }
        }
        let hash = expected.finalize().map { String(format: "%02x", $0) }.joined()
        XCTAssertEqual(try fixture.call("hash", partial: true)["hash"] as? String, hash)
        try fixture.call("publish")
        XCTAssertEqual(try fixture.call("source-open")["length"] as? Int, 300 * 1024 * 1024)
        var actual = SHA256()
        for index in 0..<600 {
            try autoreleasepool {
                let result = try fixture.call("source-read", numbers: [
                    "offset": Double(index * block.count), "length": Double(block.count)])
                let encoded = try XCTUnwrap(result["base64"] as? String)
                let bytes = try XCTUnwrap(Data(base64Encoded: encoded))
                XCTAssertEqual(bytes.count, block.count)
                actual.update(data: bytes)
            }
        }
        XCTAssertEqual(actual.finalize().map { String(format: "%02x", $0) }.joined(), hash)
    }
}
