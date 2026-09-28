import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleSyncPackFactIndexTests: XCTestCase {
    func testClaimedVersionBodyIsOmittedWhileMissingParentRelationRemains() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-facts-\(UUID().uuidString).db")
        defer { try? FileManager.default.removeItem(at: url) }
        let database = try FolioleCompanionSyncPackSQLite(url: url, create: true)
        try database.execute("CREATE TABLE node_sync_versions (version_id TEXT, object_id TEXT, " +
            "parent_version_id TEXT, host_name TEXT, created_at TEXT, content_hash TEXT, " +
            "body_text TEXT, snapshot_json TEXT)")
        try database.execute("CREATE TABLE node_sync_version_parents " +
            "(version_id TEXT, parent_version_id TEXT, ordinal INTEGER)")
        try database.execute("CREATE TABLE review_log (id TEXT, op_id TEXT, host_name TEXT, " +
            "node_id TEXT, grade INTEGER, scheduler_version TEXT, reviewed_at TEXT, " +
            "due_before TEXT, stability_before REAL, difficulty_before REAL, due_after TEXT, " +
            "stability_after REAL, difficulty_after REAL)")
        try database.execute("INSERT INTO node_sync_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)", values: [
            "v1", "node", nil, "source", "2026-09-28", "hash-1", "body-1", "{\"id\":\"node\",\"content\":null}"
        ])
        try database.execute("INSERT INTO node_sync_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)", values: [
            "v2", "node", "v1", "source", "2026-09-28", "hash-2", "body-2", "{\"id\":\"node\",\"content\":null}"
        ])
        try database.execute("INSERT INTO node_sync_version_parents VALUES ('v2', 'v1', 0)")

        let index = try FolioleCompanionSyncPackFactIndex.read(database,
            from: 0, to: 1, frontier: 1, epoch: "epoch")
        XCTAssertEqual((index["versions"] as? [[String: Any]])?.count, 2)
        try FolioleCompanionSyncPackFactIndex.retainMissing(database, index: index,
            expectedId: index["index_id"] as? String ?? "", versions: "01", parents: "00", reviews: "")
        XCTAssertEqual(try database.scalar("SELECT COUNT(*) FROM node_sync_versions"), 1)
        XCTAssertEqual(try database.scalar("SELECT COUNT(*) FROM node_sync_version_parents"), 1)
        XCTAssertEqual(try database.namedRows("SELECT version_id FROM node_sync_versions")
            .first?["version_id"] as? String, "v2")
        try database.execute("UPDATE node_sync_versions SET body_text = NULL, " +
            "snapshot_json = '{\"id\":\"node\",\"content\":null}' WHERE version_id = 'v2'")
        let reclaimed = try FolioleCompanionSyncPackFactIndex.read(database,
            from: 0, to: 1, frontier: 1, epoch: "epoch")
        XCTAssertThrowsError(try FolioleCompanionSyncPackFactIndex.retainMissing(database,
            index: reclaimed, expectedId: reclaimed["index_id"] as? String ?? "",
            versions: "00", parents: "00", reviews: ""))
    }
}
