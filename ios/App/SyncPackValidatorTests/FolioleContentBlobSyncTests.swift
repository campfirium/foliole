import CryptoKit
import Foundation
import SQLite3
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleContentBlobSyncTests: XCTestCase {
    func testStagesValidatedBodiesInTemporarySQLitePack() throws {
        let body = Data("pack body".utf8)
        let hash = digest(body)
        let url = try FolioleCompanionContentBlobPack.create(parts: [.init(data: body, hash: hash)])
        defer { try? FileManager.default.removeItem(at: url) }

        XCTAssertTrue(url.path.hasPrefix(FileManager.default.temporaryDirectory.path))
        XCTAssertEqual(try FolioleCompanionContentBlobPack.read(url).map(\.hash), [hash])
    }

    func testParsesMultipartAndAtomicallyCommitsValidatedBody() throws {
        let body = Data("hello iPhone".utf8)
        let hash = digest(body)
        let fixture = try makeDatabase(hash: hash, size: body.count)
        defer { try? FileManager.default.removeItem(at: fixture) }
        let parts = try FolioleCompanionDesktopHttpClient.parseMultipart(
            multipart(hash: hash, body: body),
            contentType: "multipart/mixed; boundary=foliole-test",
            hashHeader: "x-blob-hash"
        )

        let database = try FolioleCompanionContentBlobDatabase(url: fixture, contract: contract())
        XCTAssertEqual(try database.commit(parts: parts, failedHashes: []), [hash])
        XCTAssertEqual(try scalar(fixture, "SELECT availability FROM content_blobs WHERE hash = ?", hash), "cached")
        XCTAssertEqual(try scalar(fixture, "SELECT CAST(data AS TEXT) FROM content_blob_data WHERE hash = ?", hash), "hello iPhone")
    }

    func testRejectsHashMismatchWithoutWritingBody() throws {
        let body = Data("tampered".utf8)
        let expected = digest(Data("expected".utf8))
        let fixture = try makeDatabase(hash: expected, size: body.count)
        defer { try? FileManager.default.removeItem(at: fixture) }
        let part = FolioleCompanionContentBlobPart(data: body, hash: expected)
        let database = try FolioleCompanionContentBlobDatabase(url: fixture, contract: contract())

        XCTAssertEqual(try database.commit(parts: [part], failedHashes: []), [])
        XCTAssertEqual(try scalar(fixture, "SELECT availability FROM content_blobs WHERE hash = ?", expected), "failed")
        XCTAssertNil(try scalar(fixture, "SELECT CAST(data AS TEXT) FROM content_blob_data WHERE hash = ?", expected))
    }

    func testRejectsDuplicateBatchPartsAndUnknownSessions() async throws {
        let body = Data("duplicate".utf8)
        let hash = digest(body)
        let fixture = try makeDatabase(hash: hash, size: body.count)
        defer { try? FileManager.default.removeItem(at: fixture) }
        let database = try FolioleCompanionContentBlobDatabase(url: fixture, contract: contract())
        let part = FolioleCompanionContentBlobPart(data: body, hash: hash)

        XCTAssertThrowsError(try database.commit(parts: [part, part], failedHashes: []))
        let missing = await FolioleCompanionContentBlobSessions().load("missing")
        XCTAssertNil(missing)
    }

    private func contract() -> FolioleCompanionContentBlobContract {
        FolioleCompanionContentBlobContract(
            batchResponseKeys: [
                "batchToken": "batch_token", "databaseElapsedMs": "db_elapsed_ms", "failedHashes": "failed_hashes",
                "httpElapsedMs": "http_elapsed_ms", "parseElapsedMs": "parse_elapsed_ms",
                "syncedHashes": "synced_hashes", "totalElapsedMs": "total_elapsed_ms"
            ],
            defaultLimit: 50,
            hashPattern: "^[a-f0-9]{64}$",
            hashesReplacement: "__HASH_FILTER__",
            missingResultKeys: [
                "blobs": "blobs", "failedBytes": "failed_content_blob_bytes", "failedCount": "failed_content_blob_count",
                "hashes": "hashes", "missingBytes": "missing_content_blob_bytes", "missingCount": "missing_content_blob_count"
            ],
            requestKeys: ["batchToken": "batch_token", "body": "body", "headers": "headers", "limit": "limit", "url": "url"],
            responseHeaderKey: "x-blob-hash",
            sql: [
                "dataReplace": "INSERT OR REPLACE INTO content_blob_data (hash, data) VALUES (?, ?)",
                "manifests": "SELECT hash, compression, original_size_bytes, stored_size_bytes, original_sha256, stored_sha256 FROM content_blobs WHERE hash IN (__HASH_FILTER__)",
                "markCached": "UPDATE content_blobs SET availability = 'cached', cached_at = ?, last_verified_at = ? WHERE hash = ?",
                "markFailed": "UPDATE content_blobs SET availability = 'failed' WHERE hash = ?",
                "missing": "SELECT hash, stored_size_bytes FROM content_blobs WHERE availability <> 'cached' LIMIT ?",
                "missingSummary": "SELECT hash, stored_size_bytes, availability FROM content_blobs WHERE availability <> 'cached'"
            ],
            statuses: ["cached": "cached", "failed": "failed"],
            supportedCompression: "none"
        )
    }

    private func makeDatabase(hash: String, size: Int) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-body-\(UUID().uuidString).db")
        var database: OpaquePointer?
        guard sqlite3_open(url.path, &database) == SQLITE_OK, let database else { throw testError("open") }
        defer { sqlite3_close(database) }
        let sql = """
        CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, compression TEXT, original_size_bytes INTEGER,
          stored_size_bytes INTEGER, original_sha256 TEXT, stored_sha256 TEXT, availability TEXT,
          cached_at TEXT, last_verified_at TEXT);
        CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
        INSERT INTO content_blobs VALUES ('\(hash)', 'none', \(size), \(size), '\(hash)', '\(hash)', 'missing', NULL, NULL);
        """
        guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else { throw testError("schema") }
        return url
    }

    private func scalar(_ url: URL, _ sql: String, _ argument: String) throws -> String? {
        var database: OpaquePointer?
        var statement: OpaquePointer?
        guard sqlite3_open(url.path, &database) == SQLITE_OK, let database else { throw testError("open") }
        defer { sqlite3_close(database) }
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw testError("prepare") }
        defer { sqlite3_finalize(statement) }
        sqlite3_bind_text(statement, 1, argument, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
        guard sqlite3_step(statement) == SQLITE_ROW else { return nil }
        return sqlite3_column_text(statement, 0).map { String(cString: $0) }
    }

    private func multipart(hash: String, body: Data) -> Data {
        var result = Data("--foliole-test\r\nX-Blob-Hash: \(hash)\r\nContent-Length: \(body.count)\r\n\r\n".utf8)
        result.append(body)
        result.append(Data("\r\n--foliole-test--".utf8))
        return result
    }

    private func digest(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
    private func testError(_ detail: String) -> NSError { NSError(domain: "FolioleContentBlobTests", code: 1, userInfo: [NSLocalizedDescriptionKey: detail]) }
}
