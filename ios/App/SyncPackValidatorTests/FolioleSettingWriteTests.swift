import Foundation
import SQLite3
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleSettingWriteTests: XCTestCase {
    func testContractUsesGeneratedIOSIdentityAndMutationStateSQL() throws {
        let contract = try FolioleCompanionSettingWriteContract(bundle: .module)

        XCTAssertEqual(contract.defaults["platform"], "ios")
        XCTAssertEqual(contract.objectType, "setting")
        XCTAssertTrue(contract.settingUpsertSQL.contains("INSERT OR REPLACE INTO setting_records"))
        XCTAssertTrue(contract.stateUpsertSQL.contains("INSERT OR REPLACE INTO sync_object_state"))
        XCTAssertEqual(contract.pushAckTable, "sync_push_ack")
    }

    func testPersistsDefaultSettingAndDirtyStateWithGoldenIdentityAndHash() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let contract = try FolioleCompanionSettingWriteContract(bundle: .module)

        let result = try save(fixture.database, contract, key: " handoffReminderEnabled ", value: "true")
        XCTAssertEqual(result["object_id"] as? String, "device:ios:phone:*:handoffReminderEnabled")
        XCTAssertEqual(result["content_hash"] as? String, "fc22f284ba634489f35910c8111f0841522549f655a60c6714d2a1c0eef67c3c")
        XCTAssertEqual(
            try row(fixture.database, "SELECT key, scope, platform, form_factor, device_id, value_json FROM setting_records"),
            ["handoffReminderEnabled", "device", "ios", "phone", "*", "true"]
        )
        XCTAssertEqual(
            try row(fixture.database, "SELECT object_type, state_seq, base_content_hash, last_modified_by_device_id, sync_dirty FROM sync_object_state"),
            ["setting", "1", nil, "ios-test", "1"]
        )
    }

    func testUpdatePreservesCleanBaseHashAndDeletesStalePushAck() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let contract = try FolioleCompanionSettingWriteContract(bundle: .module)
        let objectId = "device:ios:phone:*:theme"
        let first = try save(fixture.database, contract, key: "theme", value: "\"light\"")
        let firstHash = try XCTUnwrap(first["content_hash"] as? String)
        try execute(fixture.database, "UPDATE sync_object_state SET sync_dirty = 0, base_content_hash = NULL")
        try execute(fixture.database, "INSERT INTO sync_push_ack VALUES ('setting', '\(objectId)', 'peer-1')")

        _ = try save(fixture.database, contract, key: "theme", value: "\"dark\"")
        XCTAssertEqual(
            try row(fixture.database, "SELECT state_seq, base_content_hash, sync_dirty FROM sync_object_state"),
            ["2", firstHash, "1"]
        )
        XCTAssertEqual(try scalar(fixture.database, "SELECT COUNT(*) FROM sync_push_ack"), "0")

        _ = try save(fixture.database, contract, key: "theme", value: "\"system\"")
        XCTAssertEqual(
            try row(fixture.database, "SELECT state_seq, base_content_hash FROM sync_object_state"),
            ["3", firstHash]
        )
        XCTAssertEqual(try scalar(fixture.database, "SELECT value_json FROM setting_records"), "\"system\"")
    }

    func testPersistsExplicitScopedIdentityAcrossStoreRecreation() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let contract = try FolioleCompanionSettingWriteContract(bundle: .module)
        let store = try FolioleCompanionSettingWriteStore(databaseURL: fixture.database, contract: contract)

        let result = try store.save(
            key: "density", scope: "workspace", platform: "ios",
            formFactor: "tablet", deviceId: "device-7", valueJson: "\"compact\""
        )
        XCTAssertEqual(result["object_id"] as? String, "workspace:ios:tablet:device-7:density")
        XCTAssertEqual(
            try scalar(fixture.database, "SELECT value_json FROM setting_records WHERE device_id = 'device-7'"),
            "\"compact\""
        )
    }

    func testRejectsMissingIdentityAndRollsBackBothRowsOnStateFailure() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        let contract = try FolioleCompanionSettingWriteContract(bundle: .module)

        XCTAssertThrowsError(try save(fixture.database, contract, key: "  ", value: "true"))
        try execute(fixture.database, """
        CREATE TRIGGER reject_setting_state BEFORE INSERT ON sync_object_state
        BEGIN SELECT RAISE(ABORT, 'rejected'); END
        """)
        XCTAssertThrowsError(try save(fixture.database, contract, key: "theme", value: "\"dark\""))
        XCTAssertEqual(try scalar(fixture.database, "SELECT COUNT(*) FROM setting_records"), "0")
        XCTAssertEqual(try scalar(fixture.database, "SELECT COUNT(*) FROM sync_object_state"), "0")
    }

    private func save(
        _ database: URL,
        _ contract: FolioleCompanionSettingWriteContract,
        key: String,
        value: String
    ) throws -> [String: Any] {
        let store = try FolioleCompanionSettingWriteStore(databaseURL: database, contract: contract)
        return try store.save(
            key: key,
            scope: try contract.key("scope", in: contract.defaults),
            platform: try contract.key("platform", in: contract.defaults),
            formFactor: try contract.key("formFactor", in: contract.defaults),
            deviceId: try contract.key("deviceId", in: contract.defaults),
            valueJson: value
        )
    }

    private func makeFixture() throws -> (root: URL, database: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-setting-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let database = root.appendingPathComponent("fixture.db")
        try execute(database, """
        CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO companion_meta VALUES ('device_id', 'ios-test');
        CREATE TABLE setting_records (key TEXT NOT NULL, scope TEXT NOT NULL, platform TEXT NOT NULL,
          form_factor TEXT NOT NULL, device_id TEXT NOT NULL, value_json TEXT NOT NULL,
          content_hash TEXT NOT NULL, updated_at TEXT NOT NULL,
          PRIMARY KEY (key, scope, platform, form_factor, device_id));
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
        NSError(domain: "FolioleSettingWriteTests", code: 1,
                userInfo: [NSLocalizedDescriptionKey: detail])
    }
}
