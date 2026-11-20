import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleAttachmentTrashMoveTests: XCTestCase {
    func testMovesBytesAndRestoresThemWithoutRecreatingTheFile() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let active = root.appendingPathComponent("attachment")
        let trash = root.appendingPathComponent("trash/attachment")
        let bytes = Data([1, 2, 3])
        try bytes.write(to: active)
        let originalFile = try fileNumber(active)

        try FolioleAttachmentTrashMove.move(active, to: trash)
        XCTAssertFalse(FileManager.default.fileExists(atPath: active.path))
        XCTAssertEqual(try Data(contentsOf: trash), bytes)
        XCTAssertEqual(try fileNumber(trash), originalFile)
        try FolioleAttachmentTrashMove.move(trash, to: active)
        XCTAssertFalse(FileManager.default.fileExists(atPath: trash.path))
        XCTAssertEqual(try Data(contentsOf: active), bytes)
        XCTAssertEqual(try fileNumber(active), originalFile)
    }

    func testKeepsExistingRegularDestinationAndRemovesOnlyTheSource() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let source = root.appendingPathComponent("active/attachment")
        let destination = root.appendingPathComponent("trash/attachment")
        for file in [source, destination] {
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        }
        try Data([1]).write(to: source)
        let destinationBytes = Data([2])
        try destinationBytes.write(to: destination)

        try FolioleAttachmentTrashMove.move(source, to: destination)
        XCTAssertFalse(FileManager.default.fileExists(atPath: source.path))
        XCTAssertEqual(try Data(contentsOf: destination), destinationBytes)
    }

    func testPreservesSourceWhenDestinationIsNotARegularFile() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let source = root.appendingPathComponent("active")
        let destination = root.appendingPathComponent("trash")
        let bytes = Data([1])
        try bytes.write(to: source)
        try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: false)

        XCTAssertThrowsError(try FolioleAttachmentTrashMove.move(source, to: destination))
        XCTAssertEqual(try Data(contentsOf: source), bytes)
    }

    private func temporaryRoot() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
        return root
    }

    private func fileNumber(_ url: URL) throws -> NSNumber {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        return try XCTUnwrap(attributes[.systemFileNumber] as? NSNumber)
    }
}
