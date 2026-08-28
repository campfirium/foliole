import SQLite3
import XCTest

final class FolioleAcceptanceSyncEventProjectionTests: XCTestCase {
    func testProjectsSyncEvents() throws {
        let bundle = try XCTUnwrap(Bundle.main.bundleIdentifier)
        XCTAssertTrue(bundle.hasSuffix(".t152-acceptance"))
        let build = try XCTUnwrap(ProcessInfo.processInfo.environment["FOLIOLE_T152_BUILD_IDENTITY"])
        let databaseURL = try database()
        var connection: OpaquePointer?
        XCTAssertEqual(sqlite3_open_v2(databaseURL.path, &connection, SQLITE_OPEN_READONLY, nil), SQLITE_OK)
        defer { sqlite3_close(connection) }
        let identity = try scalar(connection, """
            SELECT local_device_identity_key FROM sync_group_local_state
            WHERE singleton_id = 1 AND state = 'active' LIMIT 1
            """)
        let raw = try scalar(connection, """
            SELECT value FROM companion_meta WHERE key = 'workspace_sync_events' LIMIT 1
            """)
        let source = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [[String: Any]])
        let events = try source.filter { $0["kind"] as? String == "run_finished" }.map {
            try project($0, identity: identity)
        }
        let projection: [String: Any] = [
            "build_identity": build, "container_identity": bundle, "events": events
        ]
        let data = try JSONSerialization.data(withJSONObject: projection, options: [.prettyPrinted])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "foliole-acceptance-sync-events.json"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func database() throws -> URL {
        let library = try FileManager.default.url(for: .libraryDirectory, in: .userDomainMask,
                                                  appropriateFor: nil, create: false)
        let url = library.appendingPathComponent("CapacitorDatabase/foliole-companionSQLite.db")
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
        return url
    }

    private func scalar(_ database: OpaquePointer?, _ sql: String) throws -> String {
        var statement: OpaquePointer?
        XCTAssertEqual(sqlite3_prepare_v2(database, sql, -1, &statement, nil), SQLITE_OK)
        defer { sqlite3_finalize(statement) }
        XCTAssertEqual(sqlite3_step(statement), SQLITE_ROW)
        return String(cString: try XCTUnwrap(sqlite3_column_text(statement, 0)))
    }

    private func project(_ event: [String: Any], identity: String) throws -> [String: Any] {
        var value: [String: Any] = [
            "device_identity_key": identity,
            "run_id": try required(event, "run_id"),
            "trigger_reason": try required(event, "trigger_reason"),
            "status": try required(event, "status")
        ]
        for key in ["result", "started_at", "occurred_at"] where event[key] != nil {
            value[key] = event[key]
        }
        XCTAssertTrue(value["started_at"] != nil || value["occurred_at"] != nil)
        return value
    }

    private func required(_ value: [String: Any], _ key: String) throws -> String {
        let field = try XCTUnwrap(value[key] as? String)
        XCTAssertFalse(field.isEmpty)
        return field
    }

    private func requiredEnvironment(_ key: String) throws -> String {
        let value = try XCTUnwrap(ProcessInfo.processInfo.environment[key])
        XCTAssertFalse(value.isEmpty)
        return value
    }
}
