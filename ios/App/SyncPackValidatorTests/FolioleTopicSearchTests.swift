import Foundation
import SQLite3
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleTopicSearchTests: XCTestCase {
    func testSearchesVisibleTitleOpeningInlineAndBlobContent() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try seed(fixture.database)
        let store = try FolioleCompanionTopicSearchStore(
            databaseURL: fixture.database,
            contract: try FolioleCompanionContractStore(bundle: .module).topicSearchContract()
        )

        let response = try store.search(query: " ALPHA ", limit: 100)
        let results = try XCTUnwrap(response["results"] as? [[String: Any]])
        XCTAssertEqual(results.compactMap { $0["node_id"] as? String }, ["blob", "opening", "title", "failed"])
        XCTAssertEqual(results.first?["excerpt"] as? String, "blob alpha body")
        XCTAssertEqual(results.last?["content_status"] as? String, "failed")
        XCTAssertFalse(results.contains { ($0["node_id"] as? String) == "hidden" })
    }

    func testEnforcesDefaultAndMaximumLimitsAndEmptyQuery() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        for index in 0..<105 {
            try execute(fixture.database, "INSERT INTO nodes VALUES (?, NULL, 'topic', 'alpha', NULL, NULL, NULL, ?, ?, NULL)", [
                "topic-\(index)", timestamp(index), timestamp(index)
            ])
        }
        let store = try FolioleCompanionTopicSearchStore(
            databaseURL: fixture.database,
            contract: try FolioleCompanionContractStore(bundle: .module).topicSearchContract()
        )

        XCTAssertEqual(try results(store.search(query: "alpha", limit: nil)).count, 20)
        XCTAssertEqual(try results(store.search(query: "alpha", limit: 1_000)).count, 100)
        XCTAssertTrue(try results(store.search(query: "   ", limit: 10)).isEmpty)
    }

    private func seed(_ url: URL) throws {
        try execute(url, "INSERT INTO content_blobs VALUES ('blob-hash', 'cached'), ('failed-hash', 'failed')")
        try execute(url, "INSERT INTO content_blob_data VALUES ('blob-hash', 'blob alpha body')")
        try insert(url, id: "failed", title: "alpha failed", bodyHash: "failed-hash", updated: 1)
        try insert(url, id: "title", title: "alpha title", updated: 2)
        try insert(url, id: "opening", title: "opening", opening: "alpha opening", updated: 3)
        try insert(url, id: "blob", title: "blob", bodyHash: "blob-hash", updated: 4)
        try execute(url, "INSERT INTO nodes VALUES ('deleted', NULL, 'folder', 'deleted', NULL, NULL, NULL, ?, ?, '2026-01-01')", [timestamp(5), timestamp(5)])
        try execute(url, "INSERT INTO nodes VALUES ('hidden', 'deleted', 'topic', 'alpha hidden', NULL, NULL, NULL, ?, ?, NULL)", [timestamp(6), timestamp(6)])
    }

    private func insert(
        _ url: URL,
        id: String,
        title: String,
        opening: String? = nil,
        bodyHash: String? = nil,
        updated: Int
    ) throws {
        try execute(url, "INSERT INTO nodes VALUES (?, NULL, 'topic', ?, ?, ?, NULL, ?, ?, NULL)", [
            id, title, opening, bodyHash, timestamp(updated), timestamp(updated)
        ])
    }

    private func makeFixture() throws -> (root: URL, database: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-search-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let database = root.appendingPathComponent("fixture.db")
        try execute(database, """
        CREATE TABLE nodes (id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT, title TEXT, opening_text TEXT,
          body_blob_hash TEXT, content TEXT, updated_at TEXT, created_at TEXT, deleted_at TEXT);
        CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, availability TEXT);
        CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
        """)
        return (root, database)
    }

    private func execute(_ url: URL, _ sql: String, _ arguments: [String?] = []) throws {
        var database: OpaquePointer?
        var statement: OpaquePointer?
        guard sqlite3_open(url.path, &database) == SQLITE_OK, let database else { throw error("open") }
        defer { sqlite3_close(database) }
        if arguments.isEmpty {
            guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else { throw error("exec") }
            return
        }
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw error("prepare") }
        defer { sqlite3_finalize(statement) }
        for (offset, value) in arguments.enumerated() {
            if let value { sqlite3_bind_text(statement, Int32(offset + 1), value, -1, Self.transient) }
            else { sqlite3_bind_null(statement, Int32(offset + 1)) }
        }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw error("step") }
    }

    private func results(_ response: [String: Any]) throws -> [[String: Any]] {
        try XCTUnwrap(response["results"] as? [[String: Any]])
    }

    private func timestamp(_ index: Int) -> String { String(format: "2026-01-01T00:00:%02dZ", index) }
    private func error(_ detail: String) -> NSError { NSError(domain: "FolioleTopicSearchTests", code: 1, userInfo: [NSLocalizedDescriptionKey: detail]) }
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
}
