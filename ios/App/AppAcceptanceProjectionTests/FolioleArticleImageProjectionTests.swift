import Foundation
import SQLite3
import XCTest

final class FolioleArticleImageProjectionTests: XCTestCase {
    func testChecksMissingImagePreconditions() throws { try verify(afterRecovery: false) }
    func testChecksRecoveredArticlePersistence() throws { try verify(afterRecovery: true) }

    private func verify(afterRecovery: Bool) throws {
        XCTAssertEqual(Bundle.main.bundleIdentifier, "com.foliole.ios.s203acceptance")
        let scenario = try environment("FOLIOLE_S203_SCENARIO")
        XCTAssertTrue(["existing", "same", "changed", "failed", "local", "localized"].contains(scenario))
        let oldKey = try environment("FOLIOLE_S203_ORIGINAL_KEY")
        let expectedKey = try environment("FOLIOLE_S203_EXPECTED_\(scenario.uppercased())_KEY")
        let key = afterRecovery ? expectedKey : oldKey
        XCTAssertNotNil(key.range(of: #"^[a-f0-9]{64}\.png$"#, options: .regularExpression))
        let library = try FileManager.default.url(for: .libraryDirectory, in: .userDomainMask,
                                                  appropriateFor: nil, create: false)
        let url = library.appendingPathComponent("CapacitorDatabase/foliole-companionSQLite.db")
        var connection: OpaquePointer?
        XCTAssertEqual(sqlite3_open_v2(url.path, &connection, SQLITE_OPEN_READONLY, nil), SQLITE_OK)
        defer { sqlite3_close(connection) }
        let row = try article(connection, scenario: scenario)
        let source = try environment("FOLIOLE_S203_SOURCE_URL")
        let expectedBody = !afterRecovery && scenario == "localized"
            ? "S203 localized marker\n\n![S203 localized image](\(source))" : body(scenario, key: key)
        XCTAssertEqual(row.content, expectedBody)
        let sources = try JSONSerialization.jsonObject(with: Data(row.sources.utf8)) as? [String: String]
        XCTAssertEqual(sources, (scenario == "local" || (!afterRecovery && scenario == "localized")) ? [:] : [key: source])
        let present = try imageExists(key)
        XCTAssertEqual(present, afterRecovery ? !["failed", "local"].contains(scenario) : scenario == "existing")
        if scenario == "changed" {
            let sibling = try article(connection, scenario: "sibling")
            XCTAssertEqual(sibling.content, body("sibling", key: oldKey))
            let siblingSources = try JSONSerialization.jsonObject(with: Data(sibling.sources.utf8)) as? [String: String]
            XCTAssertEqual(siblingSources, [oldKey: try environment("FOLIOLE_S203_SOURCE_URL")])
        }
        let facts: [String: Any] = ["scenario": scenario, "after_recovery": afterRecovery,
                                   "content": row.content, "image_sources": row.sources,
                                   "file_exists": present, "storage_key": key]
        let attachment = XCTAttachment(data: try JSONSerialization.data(withJSONObject: facts),
                                       uniformTypeIdentifier: "public.json")
        attachment.name = "S203-\(scenario)-\(afterRecovery ? "persisted" : "precondition")"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func article(_ connection: OpaquePointer?, scenario: String) throws -> (content: String, sources: String) {
        var statement: OpaquePointer?
        let sql = """
            SELECT CASE WHEN n.body_blob_hash IS NULL THEN n.content ELSE CAST(cbd.data AS TEXT) END,
                   COALESCE(n.image_sources, '{}')
            FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
            WHERE n.id = ? AND n.deleted_at IS NULL
            """
        XCTAssertEqual(sqlite3_prepare_v2(connection, sql, -1, &statement, nil), SQLITE_OK)
        defer { sqlite3_finalize(statement) }
        let id = "s203-image-\(scenario)"
        _ = id.withCString { sqlite3_bind_text(statement, 1, $0, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self)) }
        XCTAssertEqual(sqlite3_step(statement), SQLITE_ROW, "Missing isolated fixture row \(id)")
        let content = String(cString: try XCTUnwrap(sqlite3_column_text(statement, 0)))
        let sources = String(cString: try XCTUnwrap(sqlite3_column_text(statement, 1)))
        XCTAssertEqual(sqlite3_step(statement), SQLITE_DONE)
        return (content, sources)
    }

    private func imageExists(_ key: String) throws -> Bool {
        let contractURL = try XCTUnwrap(Bundle.main.url(forResource: "companion-bridge-contract-definitions", withExtension: "json"))
        let contract = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: contractURL)) as? [String: Any])
        let api = try XCTUnwrap(contract["hostApi"] as? [String: Any])
        let resource = try XCTUnwrap(api["attachmentResourceSync"] as? [String: Any])
        let directory = try XCTUnwrap(resource["directoryName"] as? String)
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                  appropriateFor: nil, create: false)
        let url = support.appendingPathComponent(directory).appendingPathComponent(key)
        guard FileManager.default.fileExists(atPath: url.path) else { return false }
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        XCTAssertEqual(values.isSymbolicLink, false)
        return values.isRegularFile == true
    }

    private func body(_ scenario: String, key: String) -> String {
        "S203 \(scenario) marker\n\n![S203 \(scenario) image](asset://\(key))"
    }

    private func environment(_ key: String) throws -> String {
        try XCTUnwrap(ProcessInfo.processInfo.environment[key], "Missing S203 fixture environment: \(key)")
    }
}
