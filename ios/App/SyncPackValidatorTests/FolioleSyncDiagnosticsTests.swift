import Foundation
import SQLite3
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleSyncDiagnosticsTests: XCTestCase {
    func testReadsIosSnapshotFromGeneratedQueriesWithoutWriting() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try seed(fixture.database)
        let store = try FolioleCompanionSyncDiagnosticsStore(
            databaseURL: fixture.database,
            bundle: .module,
            pairingState: { ["device_id": "ios-device", "device_name": "iPhone", "is_paired": true] }
        )

        let snapshot = try store.diagnose()
        XCTAssertEqual(snapshot["host"] as? String, "ios")
        XCTAssertEqual(value(snapshot, "connection", "state") as? String, "ready")
        XCTAssertEqual(value(snapshot, "identity", "device_id") as? String, "ios-device")
        XCTAssertEqual(value(snapshot, "storage", "active_node_count") as? Int, 1)
        XCTAssertEqual(value(snapshot, "sync_state", "pack_cursor") as? Int, 5)
        XCTAssertEqual(value(snapshot, "sync_state", "max_state_seq") as? Int, 7)
        XCTAssertEqual(value(snapshot, "content", "missing_content_blob_count") as? Int, 1)
        XCTAssertEqual(value(snapshot, "content", "failed_content_blob_count") as? Int, 1)
        XCTAssertEqual(value(snapshot, "content", "missing_attachment_resource_count") as? Int, 1)
        XCTAssertEqual(value(snapshot, "content", "missing_image_attachment_resource_count") as? Int, 1)
        XCTAssertEqual((snapshot["events"] as? [Any])?.count, 1)
        XCTAssertThrowsError(try execute(fixture.database, "INSERT INTO companion_meta VALUES ('after', 'write')", readOnly: true))
    }

    func testDistinguishesMissingEmptyAndZeroCursor() throws {
        XCTAssertTrue(try cursorValue(nil) is NSNull)
        XCTAssertTrue(try cursorValue("") is NSNull)
        XCTAssertEqual(try cursorValue("0") as? Int, 0)
    }

    func testRejectsCorruptStoredCursorState() throws {
        for cursor in ["-1", "not-a-number", "9007199254740992", "9223372036854775808"] {
            XCTAssertThrowsError(try cursorValue(cursor), "cursor: \(cursor)") { error in
                XCTAssertEqual(error.localizedDescription, "invalid_ios_sync_pack_cursor")
            }
        }
    }

    private func cursorValue(_ cursor: String?) throws -> Any? {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        if let cursor {
            try execute(fixture.database, "INSERT INTO companion_meta VALUES ('sync_pack_cursor', '\(cursor)')")
        }
        let store = try FolioleCompanionSyncDiagnosticsStore(
            databaseURL: fixture.database,
            bundle: .module,
            pairingState: { ["is_paired": false] }
        )
        return value(try store.diagnose(), "sync_state", "pack_cursor")
    }

    private func seed(_ url: URL) throws {
        try execute(url, "INSERT INTO nodes VALUES ('topic', NULL, NULL, 'hash', 'Topic', '2026-01-01', NULL, NULL)")
        try execute(url, "INSERT INTO content_blobs VALUES ('hash', 'text_body', 'failed', 12)")
        try execute(url, "INSERT INTO sync_object_state VALUES ('node', 'topic', 7, 0, 'hash', '2026-01-01', NULL)")
        try execute(url, "INSERT INTO attachment_blobs VALUES ('image', 'image-hash', 'missing', NULL, 9, 'image/png')")
        try execute(url, "INSERT INTO node_attachments VALUES ('topic', 'image')")
        try execute(url, "INSERT INTO workspace_meta VALUES ('active_node_id', 'topic')")
        try execute(url, "INSERT INTO companion_meta VALUES ('sync_pack_cursor', '5')")
        try execute(url, "INSERT INTO companion_meta VALUES ('workspace_sync_endpoint_url', 'http://desktop')")
        try execute(url, "INSERT INTO companion_meta VALUES ('workspace_sync_events', '[{\"message\":\"Sync fully completed.\",\"occurred_at\":\"2026-01-01\",\"status\":\"completed\",\"endpoint_url\":\"http://desktop\"}]')")
    }

    private func makeFixture() throws -> (root: URL, database: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-diagnostics-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let database = root.appendingPathComponent("fixture.db")
        try execute(database, """
        CREATE TABLE nodes (id TEXT PRIMARY KEY, parent_id TEXT, deleted_at TEXT, body_blob_hash TEXT,
          title TEXT, updated_at TEXT, current_version_id TEXT, content TEXT);
        CREATE TABLE external_documents (body_blob_hash TEXT, is_present INTEGER);
        CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, kind TEXT, availability TEXT, stored_size_bytes INTEGER);
        CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
        CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, state_seq INTEGER, sync_dirty INTEGER,
          content_hash TEXT, updated_at TEXT, base_content_hash TEXT);
        CREATE TABLE sync_push_ack (object_type TEXT, object_id TEXT, status TEXT, client_op_id TEXT,
          state_seq INTEGER, acked_at TEXT);
        CREATE TABLE node_review (node_id TEXT, due TEXT);
        CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY, content_hash TEXT, availability TEXT,
          storage_key TEXT, size_bytes INTEGER, mime_type TEXT);
        CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT);
        """)
        return (root, database)
    }

    private func value(_ root: [String: Any], _ section: String, _ key: String) -> Any? {
        (root[section] as? [String: Any])?[key]
    }

    private func execute(_ url: URL, _ sql: String, readOnly: Bool = false) throws {
        var database: OpaquePointer?
        let flags = readOnly ? SQLITE_OPEN_READONLY : SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE
        guard sqlite3_open_v2(url.path, &database, flags, nil) == SQLITE_OK, let database else { throw error("open") }
        defer { sqlite3_close(database) }
        guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else { throw error(String(cString: sqlite3_errmsg(database))) }
    }

    private func error(_ detail: String) -> NSError {
        NSError(domain: "FolioleSyncDiagnosticsTests", code: 1, userInfo: [NSLocalizedDescriptionKey: detail])
    }
}
