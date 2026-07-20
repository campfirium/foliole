import Foundation
import SQLite3
import XCTest
@testable import FolioleSyncPackValidator

final class FoliolePdfPageTextTests: XCTestCase {
    func testLoadsPagesInOrderWithNullableDimensions() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try insert(fixture.database, attachmentId: "att-1", page: 2, text: "second", width: nil, height: nil)
        try insert(fixture.database, attachmentId: "att-1", page: 1, text: "first", width: 612, height: 792)
        let response = try store(fixture.database).load(attachmentId: "att-1")
        let pages = try XCTUnwrap(response["pages"] as? [[String: Any]])

        XCTAssertEqual(response["attachment_id"] as? String, "att-1")
        XCTAssertEqual(pages.compactMap { $0["page"] as? Int }, [1, 2])
        XCTAssertEqual(pages.first?["page_width"] as? Double, 612)
        XCTAssertTrue(pages.last?["page_width"] is NSNull)
    }

    func testSearchNormalizesQueryAndEnforcesLimit() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.root) }
        try insert(fixture.database, attachmentId: "att-1", page: 1, text: "before ALPHA after")
        try insert(fixture.database, attachmentId: "att-2", page: 1, text: "alpha second")
        let response = try store(fixture.database).search(query: " ALPHA ", limit: 1)
        let matches = try XCTUnwrap(response["results"] as? [[String: Any]])

        XCTAssertEqual(response["query"] as? String, " ALPHA ")
        XCTAssertEqual(matches.count, 1)
        XCTAssertEqual(matches.first?["attachment_id"] as? String, "att-1")
        XCTAssertEqual(matches.first?["match_start"] as? Int, 7)
        XCTAssertEqual(matches.first?["excerpt"] as? String, "before ALPHA after")
        XCTAssertTrue(try results(store(fixture.database).search(query: "   ", limit: nil)).isEmpty)
    }

    private func store(_ database: URL) throws -> FolioleCompanionPdfPageTextStore {
        try FolioleCompanionPdfPageTextStore(
            databaseURL: database,
            contract: FolioleCompanionPdfPageTextContractStore(bundle: .module).contract()
        )
    }

    private func results(_ response: [String: Any]) throws -> [[String: Any]] {
        try XCTUnwrap(response["results"] as? [[String: Any]])
    }

    private func makeFixture() throws -> (root: URL, database: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-pdf-text-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let database = root.appendingPathComponent("fixture.db")
        try execute(database, """
        CREATE TABLE pdf_page_text (
          attachment_id TEXT NOT NULL, page INTEGER NOT NULL, text TEXT NOT NULL,
          page_width REAL, page_height REAL, PRIMARY KEY (attachment_id, page)
        );
        """)
        return (root, database)
    }

    private func insert(
        _ url: URL,
        attachmentId: String,
        page: Int,
        text: String,
        width: Double? = nil,
        height: Double? = nil
    ) throws {
        try execute(url, "INSERT INTO pdf_page_text VALUES (?, ?, ?, ?, ?)", [
            attachmentId, String(page), text, width.map { String($0) }, height.map { String($0) }
        ])
    }

    private func execute(_ url: URL, _ sql: String, _ arguments: [String?] = []) throws {
        var database: OpaquePointer?
        var statement: OpaquePointer?
        guard sqlite3_open(url.path, &database) == SQLITE_OK, let database else { throw error("open") }
        defer { sqlite3_close(database) }
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw error("prepare")
        }
        defer { sqlite3_finalize(statement) }
        for (offset, value) in arguments.enumerated() {
            if let value { sqlite3_bind_text(statement, Int32(offset + 1), value, -1, Self.transient) }
            else { sqlite3_bind_null(statement, Int32(offset + 1)) }
        }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw error("step") }
    }

    private func error(_ detail: String) -> NSError {
        NSError(domain: "FoliolePdfPageTextTests", code: 1, userInfo: [NSLocalizedDescriptionKey: detail])
    }

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
}
