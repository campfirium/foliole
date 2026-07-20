import Foundation
import SQLite3
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleReadingWriteTests: XCTestCase {
    func testContractUsesGeneratedLearningAndSyncStateDefinitions() throws {
        let contract = try FolioleCompanionReadingWriteContract(bundle: .module)

        XCTAssertEqual(contract.objectType, "node_reading")
        XCTAssertEqual(contract.hashIgnoredPayloadKeys, ["device_id", "reading_position"])
        XCTAssertTrue(contract.readingUpsertSQL.contains("INSERT OR REPLACE INTO node_reading"))
        XCTAssertTrue(contract.readingDeviceStateUpsertSQL.contains("node_reading_device_state"))
        XCTAssertTrue(contract.stateUpsertSQL.contains("sync_object_state"))
    }

    func testPersistsReadingPositionAndDirtyStateWithGoldenHash() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let store = try makeStore(fixture.database)

        let result = try store.save(nodeId: " node-1 ", readingJson: readingJson(position: 42))

        XCTAssertEqual(result["object_id"] as? String, "node-1")
        XCTAssertEqual(result["content_hash"] as? String, "9458f05e75efb8bbd778bef32f6cd5c01422b3fef06b2dc3f4a4862e40853699")
        XCTAssertEqual(
            try row(fixture.database, "SELECT node_id, interval_duration_ms, interval_growth_factor, priority, repetition_count, state FROM node_reading"),
            ["node-1", "60000", "1.5", "2.0", "3", "active"]
        )
        XCTAssertEqual(
            try row(fixture.database, "SELECT node_id, device_id, reading_position FROM node_reading_device_state"),
            ["node-1", "ios-test", "42"]
        )
        XCTAssertEqual(
            try row(fixture.database, "SELECT object_type, state_seq, base_content_hash, last_modified_by_device_id, sync_dirty FROM sync_object_state"),
            ["node_reading", "1", nil, "ios-test", "1"]
        )
    }

    func testPositionDoesNotChangeHashAndCleanHashBecomesUpdateBase() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let store = try makeStore(fixture.database)
        let first = try store.save(nodeId: "node-1", readingJson: readingJson(position: 1))
        let firstHash = try XCTUnwrap(first["content_hash"] as? String)
        try execute(fixture.database, "UPDATE sync_object_state SET sync_dirty = 0, base_content_hash = NULL")
        try execute(fixture.database, "INSERT INTO sync_push_ack VALUES ('node_reading', 'node-1', 'peer-1')")

        let second = try store.save(nodeId: "node-1", readingJson: readingJson(position: 99))

        XCTAssertEqual(second["content_hash"] as? String, firstHash)
        XCTAssertEqual(
            try row(fixture.database, "SELECT state_seq, base_content_hash, sync_dirty FROM sync_object_state"),
            ["2", firstHash, "1"]
        )
        XCTAssertEqual(try scalar(fixture.database, "SELECT reading_position FROM node_reading_device_state"), "99")
        XCTAssertEqual(try scalar(fixture.database, "SELECT COUNT(*) FROM sync_push_ack"), "0")
    }

    func testRejectsInvalidPayloadAndRollsBackAllPermanentRows() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let store = try makeStore(fixture.database)
        try execute(fixture.database, """
        CREATE TRIGGER reject_reading_state BEFORE INSERT ON sync_object_state
        BEGIN SELECT RAISE(ABORT, 'rejected'); END
        """)

        XCTAssertThrowsError(try store.save(nodeId: " ", readingJson: readingJson(position: 1)))
        XCTAssertThrowsError(try store.save(nodeId: "node-1", readingJson: "[]"))
        XCTAssertThrowsError(try store.save(nodeId: "node-1", readingJson: readingJson(position: 1)))
        XCTAssertEqual(try scalar(fixture.database, "SELECT COUNT(*) FROM node_reading"), "0")
        XCTAssertEqual(try scalar(fixture.database, "SELECT COUNT(*) FROM node_reading_device_state"), "0")
        XCTAssertEqual(try scalar(fixture.database, "SELECT COUNT(*) FROM sync_object_state"), "0")
    }

    private func makeStore(_ database: URL) throws -> FolioleCompanionReadingWriteStore {
        try FolioleCompanionReadingWriteStore(
            databaseURL: database,
            contract: FolioleCompanionReadingWriteContract(bundle: .module)
        )
    }

    private func readingJson(position: Int) -> String {
        """
        {"interval_duration_ms":60000,"interval_growth_factor":1.5,"last_handled_at":"2026-07-20T12:00:00Z",\
        "next_at":"2026-07-20T12:01:00Z","priority":2,"reading_position":\(position),"repetition_count":3,"state":"active"}
        """
    }

    private func makeFixture() throws -> (root: URL, database: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-reading-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let database = root.appendingPathComponent("fixture.db")
        try execute(database, """
        CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO companion_meta VALUES ('device_id', 'ios-test');
        CREATE TABLE node_reading (node_id TEXT PRIMARY KEY, interval_duration_ms INTEGER NOT NULL,
          interval_growth_factor REAL NOT NULL, last_handled_at TEXT NOT NULL, next_at TEXT NOT NULL,
          priority REAL NOT NULL, repetition_count INTEGER NOT NULL, state TEXT NOT NULL);
        CREATE TABLE node_reading_device_state (node_id TEXT NOT NULL, device_id TEXT NOT NULL,
          reading_position INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (node_id, device_id));
        CREATE TABLE sync_object_state (object_type TEXT NOT NULL, object_id TEXT NOT NULL,
          state_seq INTEGER NOT NULL, current_version_id TEXT, content_hash TEXT NOT NULL,
          base_content_hash TEXT, last_modified_by_device_id TEXT NOT NULL, updated_at TEXT NOT NULL,
          deleted_at TEXT, sync_dirty INTEGER NOT NULL, PRIMARY KEY (object_type, object_id));
        CREATE TABLE sync_push_ack (object_type TEXT NOT NULL, object_id TEXT NOT NULL, peer_id TEXT NOT NULL);
        """)
        return (root, database)
    }

    private func scalar(_ url: URL, _ sql: String) throws -> String? { try row(url, sql).first ?? nil }

    private func row(_ url: URL, _ sql: String) throws -> [String?] {
        var database: OpaquePointer?
        guard sqlite3_open(url.path, &database) == SQLITE_OK, let database else { throw testError("open") }
        defer { sqlite3_close(database) }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw testError("prepare")
        }
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW else { return [] }
        return (0..<sqlite3_column_count(statement)).map { index in
            sqlite3_column_text(statement, index).map { String(cString: $0) }
        }
    }

    private func execute(_ url: URL, _ sql: String) throws {
        var database: OpaquePointer?
        guard sqlite3_open(url.path, &database) == SQLITE_OK, let database else { throw testError("open") }
        defer { sqlite3_close(database) }
        guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else { throw testError("execute") }
    }

    private func testError(_ detail: String) -> NSError {
        NSError(domain: "FolioleReadingWriteTests", code: 1, userInfo: [NSLocalizedDescriptionKey: detail])
    }
}
