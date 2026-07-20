import Foundation
import SQLite3
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleViewStateWriteTests: XCTestCase {
    func testContractUsesIOSIdentityAndSharedMutationSQL() throws {
        let contract = try FolioleCompanionViewStateWriteContract(bundle: .module)

        XCTAssertEqual(contract.platform, "ios")
        XCTAssertEqual(contract.scope, "session_resume")
        XCTAssertEqual(contract.activeNodeSQL, "INSERT OR REPLACE INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)")
        XCTAssertTrue(contract.nodeStateSQL.contains("INSERT OR REPLACE INTO node_view_state"))
    }

    func testPersistsAndClearsActiveNodeWithGoldenIdentityAndHash() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let store = try makeStore(fixture.database)

        let result = try store.saveActiveNode(" node-1 ")
        XCTAssertEqual(result["object_id"] as? String, "session_resume:ios:phone:ios-test:active_node")
        XCTAssertEqual(result["content_hash"] as? String, "0afc2df89727a0b1c58664f0d2c5ff4c59a4b33563f11ddec872bc6dab66d78e")
        XCTAssertEqual(try scalar(fixture.database, "SELECT value FROM workspace_meta WHERE key = 'active_node_id'"), "node-1")

        _ = try makeStore(fixture.database).saveActiveNode(nil)
        XCTAssertEqual(try scalar(fixture.database, "SELECT value FROM workspace_meta WHERE key = 'active_node_id'"), "")
    }

    func testPersistsClampedNodeViewStateAndIgnoresSourceInGoldenHash() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }

        let result = try makeStore(fixture.database).saveNodeViewState(nodeId: "node-1", scrollTop: -12)
        XCTAssertEqual(result["object_id"] as? String, "session_resume:ios:phone:ios-test:node:node-1")
        XCTAssertEqual(result["content_hash"] as? String, "bfc621396ab34bcd49097cbdd10c0ebf43362dfef5ed14316ca54beda74aa56b")
        XCTAssertEqual(
            try row(fixture.database, "SELECT node_id, device_id, scroll_top, selection_from, selection_to, source FROM node_view_state"),
            ["node-1", "ios-test", "0", nil, nil, "user-scroll"]
        )
    }

    func testRejectsInvalidIdentityAndRollsBackFailedMutation() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let store = try makeStore(fixture.database)

        XCTAssertThrowsError(try store.saveNodeViewState(nodeId: "  ", scrollTop: 10))
        try execute(fixture.database, "CREATE TRIGGER reject_view_state BEFORE INSERT ON node_view_state BEGIN SELECT RAISE(ABORT, 'rejected'); END")
        XCTAssertThrowsError(try store.saveNodeViewState(nodeId: "node-1", scrollTop: 10))
        XCTAssertEqual(try scalar(fixture.database, "SELECT COUNT(*) FROM node_view_state"), "0")
    }

    private func makeStore(_ database: URL) throws -> FolioleCompanionViewStateWriteStore {
        try FolioleCompanionViewStateWriteStore(
            databaseURL: database,
            contract: FolioleCompanionViewStateWriteContract(bundle: .module)
        )
    }

    private func makeFixture() throws -> (root: URL, database: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-view-state-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let database = root.appendingPathComponent("fixture.db")
        try execute(database, """
        CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO companion_meta VALUES ('device_id', 'ios-test');
        CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE node_view_state (node_id TEXT NOT NULL, device_id TEXT NOT NULL, scroll_top INTEGER NOT NULL,
          selection_from INTEGER, selection_to INTEGER, source TEXT NOT NULL, updated_at TEXT NOT NULL,
          PRIMARY KEY (node_id, device_id));
        """)
        return (root, database)
    }

    private func scalar(_ url: URL, _ sql: String) throws -> String? {
        try row(url, sql).first ?? nil
    }

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
        NSError(domain: "FolioleViewStateWriteTests", code: 1, userInfo: [NSLocalizedDescriptionKey: detail])
    }
}
