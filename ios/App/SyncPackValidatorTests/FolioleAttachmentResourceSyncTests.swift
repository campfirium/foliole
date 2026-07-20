import CryptoKit
import Foundation
import SQLite3
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleAttachmentResourceSyncTests: XCTestCase {
    func testCommitsValidatedAttachmentAndResolvesFileURL() throws {
        let data = Data("attachment bytes".utf8)
        let hash = digest(data)
        let fixture = try makeFixture(contentHash: hash)
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let store = try FolioleCompanionAttachmentResourceStore(
            databaseURL: fixture.database,
            rootURL: fixture.attachments,
            contract: contract()
        )
        let temporaryURL = try temporaryFile(data, hash: hash, root: store.temporaryRoot)
        let batch = FolioleCompanionAttachmentResourceSessions.Batch(
            downloaded: [.init(attachmentId: "att-1", contentHash: hash, temporaryURL: temporaryURL)],
            failedIds: []
        )

        XCTAssertEqual(try store.commit(batch), ["att-1"])
        XCTAssertEqual(try scalar(fixture.database, "SELECT availability FROM attachment_blobs"), "cached")
        XCTAssertTrue(FileManager.default.fileExists(atPath: fixture.attachments.appendingPathComponent(hash).path))
        XCTAssertEqual(try store.resolve(attachmentId: "att-1")["status"] as? String, "ready")
    }

    func testManifestMismatchMarksFailedWithoutPublishingFile() throws {
        let data = Data("attachment bytes".utf8)
        let actualHash = digest(data)
        let fixture = try makeFixture(contentHash: digest(Data("expected".utf8)))
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let store = try FolioleCompanionAttachmentResourceStore(
            databaseURL: fixture.database,
            rootURL: fixture.attachments,
            contract: contract()
        )
        let temporaryURL = try temporaryFile(data, hash: actualHash, root: store.temporaryRoot)
        let batch = FolioleCompanionAttachmentResourceSessions.Batch(
            downloaded: [.init(attachmentId: "att-1", contentHash: actualHash, temporaryURL: temporaryURL)],
            failedIds: []
        )

        XCTAssertEqual(try store.commit(batch), [])
        XCTAssertEqual(try scalar(fixture.database, "SELECT availability FROM attachment_blobs"), "failed")
        XCTAssertFalse(FileManager.default.fileExists(atPath: fixture.attachments.appendingPathComponent(actualHash).path))
    }

    func testMissingLookupAndSessionBoundaries() async throws {
        let hash = digest(Data("missing".utf8))
        let fixture = try makeFixture(contentHash: hash)
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let store = try FolioleCompanionAttachmentResourceStore(
            databaseURL: fixture.database,
            rootURL: fixture.attachments,
            contract: contract()
        )

        let result = try store.loadMissing(attachmentId: "att-1")
        XCTAssertEqual((result["resource"] as? [String: Any])?["content_hash"] as? String, hash)
        let missingSession = await FolioleCompanionAttachmentResourceSessions().load("missing")
        XCTAssertNil(missingSession)
        let duplicate = FolioleCompanionDownloadedAttachment(
            attachmentId: "att-1", contentHash: hash, temporaryURL: fixture.root.appendingPathComponent("missing")
        )
        XCTAssertThrowsError(try store.commit(.init(downloaded: [duplicate, duplicate], failedIds: [])))
    }

    private func contract() -> FolioleCompanionAttachmentResourceContract {
        FolioleCompanionAttachmentResourceContract(
            batchResponseKeys: ["batchToken": "batch_token", "failedAttachmentIds": "failed_attachment_ids", "syncedAttachmentIds": "synced_attachment_ids"],
            defaultLimit: 50,
            directoryName: "attachments",
            hashPattern: "^[a-f0-9]{64}$",
            idFilterReplacement: "__ATTACHMENT_ID_FILTER__",
            missingResultKeys: ["resource": "resource", "resources": "resources"],
            requestKeys: ["attachmentId": "attachment_id", "batchToken": "batch_token", "contentHash": "content_hash", "headers": "headers", "limit": "limit", "resources": "resources", "url": "url"],
            resolveResponseKeys: ["mimeType": "mime_type", "resourceUrl": "resource_url", "status": "status"],
            resolveStatuses: ["missingFile": "missing_file", "notFound": "not_found", "readyStatusKey": "ready"],
            sql: [
                "contentHashes": "SELECT attachment_id, content_hash FROM attachment_blobs WHERE attachment_id IN (__ATTACHMENT_ID_FILTER__)",
                "markCached": "UPDATE attachment_blobs SET storage_key = ?, availability = 'cached', cached_at = ?, last_verified_at = ? WHERE attachment_id = ?",
                "markFailed": "UPDATE attachment_blobs SET availability = 'failed' WHERE attachment_id = ?",
                "missingById": "SELECT attachment_id, content_hash, size_bytes, availability, storage_key FROM attachment_blobs WHERE attachment_id = ? LIMIT 1",
                "missingRows": "SELECT attachment_id, content_hash, size_bytes, availability, storage_key FROM attachment_blobs",
                "resolve": "SELECT storage_key, mime_type FROM attachment_blobs WHERE attachment_id = ? LIMIT 1"
            ],
            statuses: ["cached": "cached", "failed": "failed"]
        )
    }

    private func makeFixture(contentHash: String) throws -> (root: URL, attachments: URL, database: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-attachment-\(UUID().uuidString)")
        let databaseURL = root.appendingPathComponent("fixture.db")
        let attachments = root.appendingPathComponent("attachments")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var database: OpaquePointer?
        guard sqlite3_open(databaseURL.path, &database) == SQLITE_OK, let database else { throw testError("open") }
        defer { sqlite3_close(database) }
        let sql = """
        CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY, content_hash TEXT, size_bytes INTEGER,
          availability TEXT, storage_key TEXT, mime_type TEXT, cached_at TEXT, last_verified_at TEXT);
        INSERT INTO attachment_blobs VALUES ('att-1', '\(contentHash)', 16, 'missing', NULL, 'application/pdf', NULL, NULL);
        """
        guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else { throw testError("schema") }
        return (root, attachments, databaseURL)
    }

    private func temporaryFile(_ data: Data, hash: String, root: URL) throws -> URL {
        let url = root.appendingPathComponent(UUID().uuidString, isDirectory: true).appendingPathComponent(hash)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
        return url
    }

    private func scalar(_ url: URL, _ sql: String) throws -> String? {
        var database: OpaquePointer?
        var statement: OpaquePointer?
        guard sqlite3_open(url.path, &database) == SQLITE_OK, let database else { throw testError("open") }
        defer { sqlite3_close(database) }
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw testError("prepare") }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW else { return nil }
        return sqlite3_column_text(statement, 0).map { String(cString: $0) }
    }

    private func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    private func testError(_ detail: String) -> NSError { NSError(domain: "FolioleAttachmentResourceTests", code: 1, userInfo: [NSLocalizedDescriptionKey: detail]) }
}
