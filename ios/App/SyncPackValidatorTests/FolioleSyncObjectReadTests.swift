import Foundation
import SQLite3
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleSyncObjectReadTests: XCTestCase {
    func testLoadsIndexAndGeneratedPayloads() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try seed(fixture.database)
        let store = try makeStore(fixture.database)

        let index = try XCTUnwrap(store.loadIndex()["entries"] as? [[String: Any]])
        XCTAssertEqual(index.compactMap { $0["object_id"] as? String }, [settingObjectId, "node-1", "deleted-external"])

        let response = try store.loadObjects(
            objectIds: [" \(settingObjectId) ", "node-1"],
            objectTypes: ["setting", "node_reading"]
        )
        let objects = try XCTUnwrap(response["objects"] as? [[String: Any]])
        XCTAssertEqual(objects.count, 2)
        XCTAssertEqual(try payload(objects[0])["value_json"] as? String, "{\"mode\":\"custom\"}")
        XCTAssertEqual(try payload(objects[1])["node_id"] as? String, "node-1")
        XCTAssertEqual(try payload(objects[1])["repetition_count"] as? Int, 2)
    }

    func testFiltersTypesAndReturnsNullPayloadForDeletedObjects() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try seed(fixture.database)
        let store = try makeStore(fixture.database)

        XCTAssertTrue(try objects(store.loadObjects(objectIds: [], objectTypes: [])).isEmpty)
        XCTAssertEqual(
            try objects(store.loadObjects(objectIds: [settingObjectId, "node-1"], objectTypes: ["setting"])).count,
            1
        )
        let deleted = try objects(store.loadObjects(objectIds: ["deleted-external"], objectTypes: []))
        XCTAssertTrue(try XCTUnwrap(deleted.first)["payload_json"] is NSNull)
    }

    private func makeStore(_ database: URL) throws -> FolioleCompanionSyncObjectReadStore {
        try FolioleCompanionSyncObjectReadStore(
            databaseURL: database,
            contract: FolioleCompanionSyncObjectReadContractStore(bundle: .module).contract()
        )
    }

    private func seed(_ url: URL) throws {
        try execute(url, "INSERT INTO nodes VALUES ('node-1', NULL, NULL)")
        try execute(url, "INSERT INTO node_reading VALUES ('node-1', 10, 1.5, '2026-01-01', '2026-01-02', 2.5, 2, 'active')")
        try execute(url, "INSERT INTO setting_records VALUES ('app_settings', 'device', 'ios', 'phone', '*', '{\"mode\":\"custom\"}', 'setting-hash', '2026-01-01', NULL)")
        try execute(url, "INSERT INTO sync_object_state VALUES ('setting', '\(settingObjectId)', 'v1', 'setting-hash', '2026-01-01', NULL)")
        try execute(url, "INSERT INTO sync_object_state VALUES ('node_reading', 'node-1', 'v2', 'reading-hash', '2026-01-02', NULL)")
        try execute(url, "INSERT INTO sync_object_state VALUES ('external_document', 'deleted-external', 'v3', 'deleted-hash', '2026-01-03', '2026-01-03')")
    }

    private func makeFixture() throws -> (root: URL, database: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-sync-object-read-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let database = root.appendingPathComponent("fixture.db")
        try execute(database, """
        CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, current_version_id TEXT, content_hash TEXT, updated_at TEXT, deleted_at TEXT);
        CREATE TABLE setting_records (key TEXT, scope TEXT, platform TEXT, form_factor TEXT, device_id TEXT, value_json TEXT, content_hash TEXT, updated_at TEXT, deleted_at TEXT);
        CREATE TABLE nodes (id TEXT, parent_id TEXT, deleted_at TEXT);
        CREATE TABLE node_reading (node_id TEXT, interval_duration_ms INTEGER, interval_growth_factor REAL, last_handled_at TEXT, next_at TEXT, priority REAL, repetition_count INTEGER, state TEXT);
        """)
        return (root, database)
    }

    private func payload(_ object: [String: Any]) throws -> [String: Any] {
        let value = try XCTUnwrap(object["payload_json"] as? String)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(value.utf8)) as? [String: Any])
    }

    private func objects(_ response: [String: Any]) throws -> [[String: Any]] {
        try XCTUnwrap(response["objects"] as? [[String: Any]])
    }

    private func execute(_ url: URL, _ sql: String) throws {
        var database: OpaquePointer?
        guard sqlite3_open(url.path, &database) == SQLITE_OK, let database else { throw error("open") }
        defer { sqlite3_close(database) }
        guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else { throw error(String(cString: sqlite3_errmsg(database))) }
    }

    private func error(_ detail: String) -> NSError {
        NSError(domain: "FolioleSyncObjectReadTests", code: 1, userInfo: [NSLocalizedDescriptionKey: detail])
    }

    private var settingObjectId: String { "device:ios:phone:*:app_settings" }
}
