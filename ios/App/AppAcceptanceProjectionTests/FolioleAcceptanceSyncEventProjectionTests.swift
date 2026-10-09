import SQLite3
import XCTest

final class FolioleAcceptanceSyncEventProjectionTests: XCTestCase {
    func testProjectsSyncEvents() throws {
        let bundle = try XCTUnwrap(Bundle.main.bundleIdentifier)
        let suffix = try requiredEnvironment("FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX")
        XCTAssertEqual(suffix, ".dev")
        XCTAssertEqual(bundle, "com.campfirium.foliole.ios\(suffix)")
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
        var projection = try persistentSyncFacts(connection)
        projection["build_identity"] = build
        projection["conflict_versions"] = try conflictVersions(connection, peer: desktopForkLabel())
        projection["container_identity"] = bundle
        projection["events"] = events
        let data = try JSONSerialization.data(withJSONObject: projection, options: [.prettyPrinted])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "foliole-acceptance-sync-events.json"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func persistentSyncFacts(_ connection: OpaquePointer?) throws -> [String: Any] {
        [
            "inventory": try json(connection, """
                SELECT json_group_array(json_object(
                  'object_type', object_type, 'object_id', object_id, 'content_hash', content_hash,
                  'frontier', json(frontier_json), 'relations', json(relations_json),
                  'reviews', json(reviews_json), 'states', json(states_json), 'resources', json(resources_json)))
                FROM framed_sync_inventory
                """),
            "state_inventory_rows": try json(connection, """
                SELECT json_group_array(json_object(
                  'object_type', state.object_type, 'object_id', state.object_id,
                  'content_hash', state.content_hash, 'current_version_id', state.current_version_id,
                  'deleted_at', state.deleted_at,
                  'node_exists', EXISTS(SELECT 1 FROM nodes WHERE id = state.object_id),
                  'review_exists', EXISTS(SELECT 1 FROM node_review WHERE node_id = state.object_id),
                  'body_blob_hash', CASE WHEN state.object_type = 'external_document'
                    AND state.deleted_at IS NULL THEN (SELECT body_blob_hash FROM external_documents
                      WHERE document_id = state.object_id AND (CAST(content AS BLOB) <> X'' OR
                        body_blob_hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'))
                    ELSE NULL END)) FROM sync_object_state state
                """),
            "acceptance_document": try json(connection, """
                SELECT json_group_array(json_object('id', id, 'content', content,
                  'current_version_id', current_version_id)) FROM nodes
                WHERE id = 't333-physical-body-20261009'
                """),
            "overwrite_pending": try json(connection, """
                SELECT COUNT(*) FROM sync_group_metadata WHERE key = 'sync_group_overwrite_progress'
                """)
        ]
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

    private func json(_ database: OpaquePointer?, _ sql: String) throws -> Any {
        try JSONSerialization.jsonObject(with: Data(scalar(database, sql).utf8), options: [.fragmentsAllowed])
    }

    private func desktopForkLabel() -> String {
        ProcessInfo.processInfo.environment["FOLIOLE_T152_DESKTOP_FORK_LABEL"] ?? "macos"
    }

    private func conflictVersions(_ database: OpaquePointer?, peer: String) throws -> [[String: Any]] {
        let sql = """
            SELECT version.object_id, version.version_id, version.content_hash,
                   COALESCE(GROUP_CONCAT(parent.parent_version_id, CHAR(31)), ''),
                   CASE WHEN node.current_version_id = version.version_id THEN 1 ELSE 0 END,
                   version.body_text
            FROM node_sync_versions version
            JOIN nodes node ON node.id = version.object_id
            LEFT JOIN node_sync_version_parents parent ON parent.version_id = version.version_id
            WHERE version.object_id LIKE 'multi-device-sync-conflict-%'
            GROUP BY version.object_id, version.version_id, version.content_hash,
                     node.current_version_id, version.body_text
            ORDER BY version.created_at, version.version_id
            """
        var statement: OpaquePointer?
        XCTAssertEqual(sqlite3_prepare_v2(database, sql, -1, &statement, nil), SQLITE_OK)
        defer { sqlite3_finalize(statement) }
        var rows: [[String: Any]] = []
        var step = sqlite3_step(statement)
        while step == SQLITE_ROW {
            let body = column(statement, 5)
            rows.append([
                "object_id": column(statement, 0), "version_id": column(statement, 1),
                "content_hash": column(statement, 2),
                "parents": column(statement, 3).split(separator: "\u{001f}").map(String.init),
                "is_current": sqlite3_column_int(statement, 4) == 1,
                "forks": ["fri", peer].filter {
                    $0 == "fri" ? body.contains("Fri conflict fork")
                        : body.contains("Desktop fork \(peer)")
                }
            ])
            step = sqlite3_step(statement)
        }
        XCTAssertEqual(step, SQLITE_DONE)
        return rows
    }

    private func column(_ statement: OpaquePointer?, _ index: Int32) -> String {
        guard let text = sqlite3_column_text(statement, index) else { return "" }
        return String(cString: text)
    }

    private func project(_ event: [String: Any], identity: String) throws -> [String: Any] {
        var value: [String: Any] = [
            "device_identity_key": identity,
            "error": event["status"] as? String == "failed"
                ? (event["message"] as? String ?? "sync_failed")
                : NSNull(),
            "run_id": try required(event, "run_id"),
            "trigger_reason": try required(event, "trigger_reason"),
            "status": try required(event, "status")
        ]
        for key in ["result", "message", "summary", "started_at", "occurred_at"] where event[key] != nil {
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
