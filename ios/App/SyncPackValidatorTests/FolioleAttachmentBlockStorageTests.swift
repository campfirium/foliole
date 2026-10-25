import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleAttachmentBlockStorageTests: XCTestCase {
    func testAppendTruncateAndReopenPreserveExactPartialBytes() throws {
        let fixture = try AttachmentBlockStorageFixture()
        defer { fixture.close() }
        let block = Data(repeating: 0x42, count: 524288)
        try fixture.call("append", numbers: ["offset": 0], bytes: block)
        try fixture.call("append", numbers: ["offset": 524288], bytes: Data([1, 2, 3]))
        XCTAssertEqual(try fixture.call("stat", partial: true)["length"] as? Int, 524291)
        try fixture.call("truncate", numbers: ["length": 524288])
        fixture.storage.close()
        let reopened = try FolioleAttachmentBlockStorage(root: fixture.root, trash: { fixture.trash })
        defer { reopened.close() }
        let info = try reopened.execute(action: "stat", key: fixture.key, partial: true)
        XCTAssertEqual(info["length"] as? Int, block.count)
        XCTAssertEqual(try Data(contentsOf: fixture.partial), block)
        XCTAssertEqual(try reopened.execute(action: "hash", key: fixture.key, partial: true)["hash"] as? String,
                       AttachmentBlockStorageFixture.hash(block))
    }

    func testInvalidAppendAndNumericRangesKeepExistingBytes() throws {
        let fixture = try AttachmentBlockStorageFixture()
        defer { fixture.close() }
        let bytes = Data([1, 2, 3])
        try fixture.call("append", numbers: ["offset": 0], bytes: bytes)
        XCTAssertThrowsError(try fixture.call("append", numbers: ["offset": 2], bytes: Data([4])))
        XCTAssertThrowsError(try fixture.call("append", numbers: ["offset": 3], bytes: Data(count: 524289)))
        XCTAssertThrowsError(try fixture.storage.execute(action: "append", key: fixture.key,
            number: { _ in 3 }, base64: "not-base64"))
        for value in [-1, 0.5, Double.infinity, Double.nan, 8589934593] {
            XCTAssertThrowsError(try fixture.call("truncate", numbers: ["length": value]))
        }
        XCTAssertThrowsError(try fixture.call("truncate"))
        XCTAssertEqual(try Data(contentsOf: fixture.partial), bytes)
    }

    func testReceiverLockIsExclusiveAndCloseReleasesIt() throws {
        let fixture = try AttachmentBlockStorageFixture()
        defer { fixture.close() }
        let other = try FolioleAttachmentBlockStorage(root: fixture.root, trash: { fixture.trash })
        defer { other.close() }
        try fixture.call("acquire")
        XCTAssertThrowsError(try other.execute(action: "acquire", key: fixture.key)) {
            XCTAssertTrue($0.localizedDescription.contains("attachment_receiver_busy"))
        }
        fixture.storage.close()
        XCTAssertNoThrow(try other.execute(action: "acquire", key: fixture.key))
    }

    func testPublishReplacesOnlyAtRenameAndKeepsPartialOnRenameFailure() throws {
        let fixture = try AttachmentBlockStorageFixture()
        defer { fixture.close() }
        let bytes = Data("replacement".utf8)
        try FileManager.default.createDirectory(at: fixture.published, withIntermediateDirectories: true)
        try fixture.call("append", numbers: ["offset": 0], bytes: bytes)
        XCTAssertThrowsError(try fixture.call("publish"))
        XCTAssertEqual(try Data(contentsOf: fixture.partial), bytes)
        XCTAssertTrue(FileManager.default.fileExists(atPath: fixture.published.path))
        try FileManager.default.removeItem(at: fixture.published)
        try Data("old original".utf8).write(to: fixture.published)
        XCTAssertEqual(try Data(contentsOf: fixture.published), Data("old original".utf8))
        try fixture.call("publish")
        XCTAssertEqual(try Data(contentsOf: fixture.published), bytes)
        XCTAssertFalse(FileManager.default.fileExists(atPath: fixture.partial.path))
        let info = try fixture.call("stat")
        XCTAssertEqual(info["hash"] as? String, AttachmentBlockStorageFixture.hash(bytes))
    }

    func testRejectsUnsafeKeysAndPartialSymlinksWithoutChangingTheirTarget() throws {
        let fixture = try AttachmentBlockStorageFixture()
        defer { fixture.close() }
        let outside = fixture.directory.appendingPathComponent("original")
        let bytes = Data("original".utf8)
        try bytes.write(to: outside)
        try FileManager.default.createSymbolicLink(at: fixture.partial, withDestinationURL: outside)
        for action in ["append", "truncate", "discard", "publish"] {
            XCTAssertThrowsError(try fixture.call(action, numbers: ["length": 0, "offset": 0], bytes: Data()))
        }
        XCTAssertThrowsError(try fixture.call("stat", key: "../original"))
        XCTAssertThrowsError(try fixture.call("append", key: "bad", numbers: ["offset": 0], bytes: Data()))
        XCTAssertEqual(try Data(contentsOf: outside), bytes)
    }

    func testDiscardRemovesOnlyPartialAndAllowsEmptyPublication() throws {
        let fixture = try AttachmentBlockStorageFixture()
        defer { fixture.close() }
        try Data("original".utf8).write(to: fixture.published)
        try fixture.call("append", numbers: ["offset": 0], bytes: Data([1]))
        try fixture.call("discard")
        XCTAssertFalse(FileManager.default.fileExists(atPath: fixture.partial.path))
        XCTAssertEqual(try Data(contentsOf: fixture.published), Data("original".utf8))
        try fixture.call("truncate", numbers: ["length": 0])
        try fixture.call("publish")
        XCTAssertEqual(try fixture.call("stat")["length"] as? Int, 0)
    }
}
