import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleAttachmentResourceReadinessTests: XCTestCase {
    func testPresenceOnlyAcceptsStoredFileWithoutDigestWhileStrictRejectsCorruptBytes() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let bytes = Data([1, 2, 3])
        let file = root.appendingPathComponent("attachment")
        try bytes.write(to: file)
        let validHash = try FolioleCompanionAttachmentResourceDownloader.digestHex(file)
        var digests = 0
        let counted: (URL) throws -> String = { url in
            digests += 1
            return try FolioleCompanionAttachmentResourceDownloader.digestHex(url)
        }

        XCTAssertTrue(FolioleAttachmentResourceReadiness.isReady(
            file, contentHash: validHash, presenceOnly: false, digestHex: counted))
        XCTAssertEqual(digests, 1)

        try Data([9, 9, 9]).write(to: file)
        XCTAssertTrue(FolioleAttachmentResourceReadiness.isReady(
            file, contentHash: validHash, presenceOnly: true, digestHex: counted))
        XCTAssertEqual(digests, 1, "Presence checks must not read the attachment bytes")
        XCTAssertFalse(FolioleAttachmentResourceReadiness.isReady(
            file, contentHash: validHash, presenceOnly: false, digestHex: counted))
        XCTAssertEqual(digests, 2)
    }

    func testPresenceOnlyStillRejectsMissingFilesAndLinks() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let target = root.appendingPathComponent("target")
        try Data([1]).write(to: target)
        let link = root.appendingPathComponent("link")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: target)
        let neverDigest: (URL) throws -> String = { _ in
            XCTFail("Missing files and links must not be read")
            return ""
        }

        XCTAssertFalse(FolioleAttachmentResourceReadiness.isReady(
            root.appendingPathComponent("missing"), contentHash: "", presenceOnly: true, digestHex: neverDigest))
        XCTAssertFalse(FolioleAttachmentResourceReadiness.isReady(
            link, contentHash: "", presenceOnly: true, digestHex: neverDigest))
        XCTAssertFalse(FolioleAttachmentResourceReadiness.isReady(
            root, contentHash: "", presenceOnly: true, digestHex: neverDigest))
    }

    func testImageDisplayAcceptsStoredImageWithoutDigestButNotOtherTypes() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("attachment")
        try Data([9, 9, 9]).write(to: file)
        var digests = 0
        let counted: (URL) throws -> String = { url in
            digests += 1
            return try FolioleCompanionAttachmentResourceDownloader.digestHex(url)
        }

        XCTAssertTrue(FolioleAttachmentResourceReadiness.isReady(
            file, contentHash: "expected", presenceOnly: false, imageDisplay: true, mimeType: "image/png",
            digestHex: counted))
        XCTAssertEqual(digests, 0, "Image display must not read the stored image")
        XCTAssertFalse(FolioleAttachmentResourceReadiness.isReady(
            file, contentHash: "expected", presenceOnly: false, imageDisplay: true, mimeType: "application/pdf",
            digestHex: counted))
        XCTAssertEqual(digests, 1, "Image display of a PDF still checks its bytes")
        XCTAssertFalse(FolioleAttachmentResourceReadiness.isReady(
            root.appendingPathComponent("missing"), contentHash: "", presenceOnly: false, imageDisplay: true,
            mimeType: "image/png", digestHex: counted))
    }

    private func temporaryRoot() throws -> URL {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-attachment-readiness-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }
}
