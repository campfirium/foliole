import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleAttachmentCommitRecoveryTests: XCTestCase {
    func testFailedManifestCommitRetainsCompletedBytesAndRetriesWithoutNetwork() async throws {
        let fixture = try Fixture()
        defer { fixture.close() }
        let sessions = FolioleCompanionAttachmentResourceSessions()
        let token = await sessions.create(downloaded: [fixture.item], failedIds: [])
        let batch = try await XCTUnwrapAsync(sessions.load(token))
        let staged = try FolioleCompanionAttachmentFileStage.stage(batch, directoryName: fixture.directoryName)
        await sessions.markStaged(token, result: staged)
        try await sessions.finish(token, committed: false)
        XCTAssertFalse(FileManager.default.fileExists(atPath: fixture.published.path))
        XCTAssertEqual(try Data(contentsOf: fixture.temporary), fixture.bytes)
        let checkpoint = try FolioleCompanionAttachmentCheckpoint(
            databasePath: "fixture.db", partialURL: fixture.temporary.appendingPathExtension("unverified"),
            hash: fixture.item.contentHash
        ) { _, payload in XCTAssertEqual(payload["action"] as? String, "clear"); return [:] }
        try await FolioleCompanionAttachmentResourceDownloader.receiveFile(
            fixture.temporary.appendingPathExtension("unverified"), verified: fixture.temporary,
            hash: fixture.item.contentHash, checkpoint: checkpoint
        ) { _ in XCTFail("Retained completed bytes must not download again"); throw CancellationError() }
        let next = FolioleCompanionAttachmentResourceSessions()
        let nextToken = await next.create(downloaded: [fixture.item], failedIds: [])
        let nextBatch = try await XCTUnwrapAsync(next.load(nextToken))
        let nextStage = try FolioleCompanionAttachmentFileStage.stage(nextBatch, directoryName: fixture.directoryName)
        await next.markStaged(nextToken, result: nextStage)
        try await next.finish(nextToken, committed: true)
        XCTAssertEqual(try Data(contentsOf: fixture.published), fixture.bytes)
    }

    func testFailureBeforePublicationRetainsCompletedTemporaryFile() async throws {
        let fixture = try Fixture()
        defer { fixture.close() }
        let sessions = FolioleCompanionAttachmentResourceSessions()
        let token = await sessions.create(downloaded: [fixture.item], failedIds: [])
        try await sessions.finish(token, committed: false)
        XCTAssertEqual(try Data(contentsOf: fixture.temporary), fixture.bytes)
    }

    private func XCTUnwrapAsync<T>(_ value: T?) throws -> T { try XCTUnwrap(value) }

    func testConflictingRecoveryDestinationPreservesBothFilesAndCanRetry() async throws {
        let fixture = try Fixture()
        defer { fixture.close() }
        let sessions = FolioleCompanionAttachmentResourceSessions()
        let token = await sessions.create(downloaded: [fixture.item], failedIds: [])
        let batch = try await XCTUnwrapAsync(sessions.load(token))
        let staged = try FolioleCompanionAttachmentFileStage.stage(batch, directoryName: fixture.directoryName)
        await sessions.markStaged(token, result: staged)
        try Data([1]).write(to: fixture.temporary)
        do {
            try await sessions.finish(token, committed: false)
            XCTFail("Conflicting recovery destination must fail")
        } catch {
            XCTAssertEqual(try Data(contentsOf: fixture.published), fixture.bytes)
            XCTAssertEqual(try Data(contentsOf: fixture.temporary), Data([1]))
        }
        let retained = await sessions.load(token)
        XCTAssertNotNil(retained)
        try FileManager.default.removeItem(at: fixture.temporary)
        try await sessions.finish(token, committed: false)
        XCTAssertEqual(try Data(contentsOf: fixture.temporary), fixture.bytes)
    }

    private struct Fixture {
        let directoryName = "foliole-test-commit-\(UUID().uuidString)"
        let bytes = Data("verified attachment bytes".utf8)
        let temporaryRoot: URL
        let publishedRoot: URL
        let temporary: URL
        let published: URL
        let item: FolioleCompanionDownloadedAttachment

        init() throws {
            temporaryRoot = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: temporaryRoot, withIntermediateDirectories: true)
            temporary = temporaryRoot.appendingPathComponent("verified")
            try bytes.write(to: temporary)
            let hash = try FolioleCompanionAttachmentResourceDownloader.digestHex(temporary)
            publishedRoot = try FileManager.default.url(for: .applicationSupportDirectory,
                in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent(directoryName)
            published = publishedRoot.appendingPathComponent("\(hash).png")
            item = .init(attachmentId: hash, contentHash: hash, mimeType: "image/png",
                         storageKey: "\(hash).png", temporaryURL: temporary)
        }
        func close() {
            try? FileManager.default.removeItem(at: temporaryRoot)
            try? FileManager.default.removeItem(at: publishedRoot)
        }
    }
}
