import Foundation
import SQLite3
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleReviewWriteTests: XCTestCase {
    func testContractUsesGeneratedReviewAndLogDefinitions() throws {
        let contract = try FolioleCompanionReviewWriteContract(bundle: .module)

        XCTAssertEqual(contract.objectType, "node_review")
        XCTAssertEqual(contract.reviewLogColumnKeys, [
            "id", "op_id", "device_id", "node_id", "grade", "scheduler_version", "reviewed_at",
            "due_before", "stability_before", "difficulty_before", "due_after",
            "stability_after", "difficulty_after"
        ])
        XCTAssertTrue(contract.reviewUpsertSQL.contains("INSERT OR REPLACE INTO node_review"))
        XCTAssertTrue(contract.reviewLogInsertSQL.contains("INSERT OR IGNORE INTO review_log"))
    }

    func testPersistsReviewLogAndDirtyStateWithGoldenHash() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let store = try makeStore(fixture.database)

        let result = try store.save(
            nodeId: " node-review-1 ", reviewJson: reviewJson(), reviewLogJson: reviewLogJson()
        )

        XCTAssertEqual(result["object_id"] as? String, "node-review-1")
        XCTAssertEqual(result["op_id"] as? String, "op-1")
        XCTAssertEqual(result["content_hash"] as? String, "3c6888f1a271a8fe262dc9df7f03a63cee6525f11d916e1bdbb85d5b764bc810")
        XCTAssertEqual(
            try row(fixture.database, "SELECT node_id, due, state, stability, difficulty, reps, lapses FROM node_review"),
            ["node-review-1", "2026-07-27T12:00:00Z", "2", "8.5", "5.2", "4", "1"]
        )
        XCTAssertEqual(
            try row(fixture.database, "SELECT id, op_id, device_id, node_id, grade, scheduler_version FROM review_log"),
            ["row-1", "op-1", "ios-test", "node-review-1", "3", "fsrs-6"]
        )
        XCTAssertEqual(
            try row(fixture.database, "SELECT object_type, state_seq, base_content_hash, last_modified_by_device_id, sync_dirty FROM sync_object_state"),
            ["node_review", "1", nil, "ios-test", "1"]
        )
    }

    func testPersistsProfileWithoutInventingReviewLogIdentity() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let result = try makeStore(fixture.database).save(
            nodeId: "node-review-1", reviewJson: reviewJson(lastReviewAt: nil), reviewLogJson: nil
        )

        XCTAssertNil(result["op_id"])
        XCTAssertNil(try scalar(fixture.database, "SELECT last_review_at FROM node_review"))
        XCTAssertEqual(try scalar(fixture.database, "SELECT COUNT(*) FROM review_log"), "0")
    }

    func testUpdatePreservesCleanBaseHashAndDeletesPushAck() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let store = try makeStore(fixture.database)
        let first = try store.save(nodeId: "node-review-1", reviewJson: reviewJson(), reviewLogJson: nil)
        let firstHash = try XCTUnwrap(first["content_hash"] as? String)
        try execute(fixture.database, "UPDATE sync_object_state SET sync_dirty = 0, base_content_hash = NULL")
        try execute(fixture.database, "INSERT INTO sync_push_ack VALUES ('node_review', 'node-review-1', 'peer-1')")

        _ = try store.save(nodeId: "node-review-1", reviewJson: reviewJson(stability: 9.5), reviewLogJson: nil)

        XCTAssertEqual(
            try row(fixture.database, "SELECT state_seq, base_content_hash, sync_dirty FROM sync_object_state"),
            ["2", firstHash, "1"]
        )
        XCTAssertEqual(try scalar(fixture.database, "SELECT COUNT(*) FROM sync_push_ack"), "0")
    }

    func testStateFailureRollsBackReviewAndAppendOnlyLog() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try execute(fixture.database, """
        CREATE TRIGGER reject_review_state BEFORE INSERT ON sync_object_state
        BEGIN SELECT RAISE(ABORT, 'rejected'); END
        """)

        XCTAssertThrowsError(try makeStore(fixture.database).save(
            nodeId: "node-review-1", reviewJson: reviewJson(), reviewLogJson: reviewLogJson()
        ))
        XCTAssertEqual(try scalar(fixture.database, "SELECT COUNT(*) FROM node_review"), "0")
        XCTAssertEqual(try scalar(fixture.database, "SELECT COUNT(*) FROM review_log"), "0")
        XCTAssertEqual(try scalar(fixture.database, "SELECT COUNT(*) FROM sync_object_state"), "0")
    }

    private func makeStore(_ database: URL) throws -> FolioleCompanionReviewWriteStore {
        var values = ["op-1", "row-1"]
        return try FolioleCompanionReviewWriteStore(
            databaseURL: database, contract: FolioleCompanionReviewWriteContract(bundle: .module),
            makeUuid: { values.removeFirst() }
        )
    }

    private func reviewJson(lastReviewAt: String? = "2026-07-20T12:00:00Z", stability: Double = 8.5) -> String {
        let last = lastReviewAt.map { "\"\($0)\"" } ?? "null"
        return """
        {"difficulty":5.2,"due":"2026-07-27T12:00:00Z","elapsed_days":3,"lapses":1,\
        "last_review_at":\(last),"reps":4,"scheduled_days":7,"stability":\(stability),"state":2}
        """
    }

    private func reviewLogJson() -> String {
        """
        {"cardAfter":{"difficulty":5.2,"due":"2026-07-27T12:00:00Z","stability":8.5},\
        "cardBefore":{"difficulty":6.1,"due":"2026-07-20T12:00:00Z","stability":4.2},\
        "grade":3,"reviewedAt":"2026-07-20T12:00:00Z","schedulerVersion":"fsrs-6"}
        """
    }

    private func makeFixture() throws -> (root: URL, database: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-review-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let database = root.appendingPathComponent("fixture.db")
        try execute(database, Self.schema)
        return (root, database)
    }

    private static let schema = """
    CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO companion_meta VALUES ('device_id', 'ios-test');
    CREATE TABLE node_review (node_id TEXT PRIMARY KEY, due TEXT NOT NULL, last_review_at TEXT,
      state INTEGER NOT NULL, stability REAL NOT NULL, difficulty REAL NOT NULL,
      elapsed_days INTEGER NOT NULL, scheduled_days INTEGER NOT NULL, reps INTEGER NOT NULL, lapses INTEGER NOT NULL);
    CREATE TABLE review_log (id TEXT PRIMARY KEY, op_id TEXT UNIQUE NOT NULL, device_id TEXT NOT NULL,
      node_id TEXT NOT NULL, grade INTEGER NOT NULL, scheduler_version TEXT NOT NULL, reviewed_at TEXT NOT NULL,
      due_before TEXT NOT NULL, stability_before REAL NOT NULL, difficulty_before REAL NOT NULL,
      due_after TEXT NOT NULL, stability_after REAL NOT NULL, difficulty_after REAL NOT NULL);
    CREATE TABLE sync_object_state (object_type TEXT NOT NULL, object_id TEXT NOT NULL,
      state_seq INTEGER NOT NULL, current_version_id TEXT, content_hash TEXT NOT NULL,
      base_content_hash TEXT, last_modified_by_device_id TEXT NOT NULL, updated_at TEXT NOT NULL,
      deleted_at TEXT, sync_dirty INTEGER NOT NULL, PRIMARY KEY (object_type, object_id));
    CREATE TABLE sync_push_ack (object_type TEXT NOT NULL, object_id TEXT NOT NULL, peer_id TEXT NOT NULL);
    """

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
        NSError(domain: "FolioleReviewWriteTests", code: 1, userInfo: [NSLocalizedDescriptionKey: detail])
    }
}
