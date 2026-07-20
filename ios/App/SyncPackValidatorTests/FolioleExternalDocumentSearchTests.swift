import Foundation
import SQLite3
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleExternalDocumentSearchTests: XCTestCase {
    func testLoadsDirectoryEntriesAndFoldersFromSyncedDatabase() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try seed(fixture.database)

        let response = try store(fixture.database).loadDirectory()
        let entries = try XCTUnwrap(response["entries"] as? [[String: Any]])
        let folders = try XCTUnwrap(response["folders"] as? [[String: Any]])
        XCTAssertEqual(entries.first?["absolute_path"] as? String, "blob")
        XCTAssertEqual(entries.compactMap { $0["document_id"] as? String }, ["blob", "inline", "missing"])
        XCTAssertEqual(folders.first?["id"] as? String, "folder")
        XCTAssertEqual(folders.first?["document_count"] as? Int, 3)
    }

    func testLoadsVisibleDocumentBodyWithoutLeakingStorageMetadata() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try seed(fixture.database)

        let response = try store(fixture.database).load(documentId: " blob ")
        let document = try XCTUnwrap(response["document"] as? [String: Any])
        XCTAssertEqual(document["document_id"] as? String, "blob")
        XCTAssertEqual(document["content"] as? String, "blob alpha body")
        XCTAssertEqual(document["content_status"] as? String, "ready")
        XCTAssertNil(document["body_blob_hash"])
    }

    func testReturnsNullForBlankOrAbsentDocument() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try seed(fixture.database)
        let store = try store(fixture.database)

        XCTAssertTrue(try store.load(documentId: "   ")["document"] is NSNull)
        XCTAssertTrue(try store.load(documentId: "absent")["document"] is NSNull)
    }

    func testSearchesVisibleInlineAndBlobDocumentsWithBodyStatus() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try seed(fixture.database)
        let response = try store(fixture.database).search(query: " ALPHA ", limit: 20)
        let results = try XCTUnwrap(response["results"] as? [[String: Any]])

        XCTAssertEqual(response["query"] as? String, " ALPHA ")
        XCTAssertEqual(results.compactMap { $0["document_id"] as? String }, ["blob", "inline", "missing"])
        XCTAssertEqual(results.first?["content"] as? String, "blob alpha body")
        XCTAssertEqual(results.first?["content_status"] as? String, "ready")
        XCTAssertEqual(results.last?["content_status"] as? String, "failed")
        XCTAssertNil(results.first?["body_blob_hash"])
        XCTAssertFalse(results.contains { ($0["document_id"] as? String) == "absent" })
    }

    func testEnforcesLimitAndReturnsEmptyForBlankQuery() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try seed(fixture.database)
        let store = try store(fixture.database)

        XCTAssertEqual(try results(store.search(query: "alpha", limit: 1)).count, 1)
        XCTAssertTrue(try results(store.search(query: "   ", limit: nil)).isEmpty)
    }

    private func store(_ database: URL) throws -> FolioleCompanionExternalDocumentSearchStore {
        try FolioleCompanionExternalDocumentSearchStore(
            databaseURL: database,
            contract: FolioleCompanionExternalDocumentSearchContractStore(bundle: .module).contract()
        )
    }

    private func seed(_ url: URL) throws {
        try execute(url, "INSERT INTO external_search_folders (id, folder_path, document_count) VALUES ('folder', '/library', 3)")
        try execute(url, "INSERT INTO content_blobs VALUES ('blob-hash', 'cached'), ('missing-hash', 'failed')")
        try execute(url, "INSERT INTO content_blob_data VALUES ('blob-hash', 'blob alpha body')")
        try insert(url, id: "missing", title: "alpha missing", bodyHash: "missing-hash", updated: 1)
        try insert(url, id: "inline", content: "inline alpha body", updated: 2)
        try insert(url, id: "blob", bodyHash: "blob-hash", updated: 3)
        try insert(url, id: "absent", title: "alpha absent", present: 0, updated: 4)
    }

    private func insert(
        _ url: URL,
        id: String,
        title: String? = nil,
        content: String? = nil,
        bodyHash: String? = nil,
        present: Int = 1,
        updated: Int
    ) throws {
        try execute(url, "INSERT INTO external_documents VALUES (?, 'folder', ?, ?, 'md', ?, NULL, ?, ?, ?, ?)", [
            id, "\(id).md", "\(id).md", title, content, bodyHash, String(present), timestamp(updated)
        ])
    }

    private func makeFixture() throws -> (root: URL, database: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-external-search-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let database = root.appendingPathComponent("fixture.db")
        try execute(database, """
        CREATE TABLE external_documents (
          document_id TEXT PRIMARY KEY, folder_id TEXT, relative_path TEXT, file_name TEXT, extension TEXT,
          title TEXT, opening_text TEXT, content TEXT, body_blob_hash TEXT, is_present INTEGER, updated_at TEXT
        );
        CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, availability TEXT);
        CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
        CREATE TABLE external_search_folders (id TEXT PRIMARY KEY, folder_path TEXT, document_count INTEGER);
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
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw error("prepare")
        }
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
    private func error(_ detail: String) -> NSError {
        NSError(domain: "FolioleExternalDocumentSearchTests", code: 1, userInfo: [NSLocalizedDescriptionKey: detail])
    }
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
}
