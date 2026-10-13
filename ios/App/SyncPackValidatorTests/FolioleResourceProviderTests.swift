import CryptoKit
import Foundation
import SQLite3
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleResourceProviderTests: XCTestCase {
    func testAttachmentStorageExhaustionHasSpecificFailure() {
        let error = NSError(domain: NSCocoaErrorDomain, code: CocoaError.fileWriteOutOfSpace.rawValue)
        XCTAssertEqual(FolioleCompanionAttachmentResourceDownloader.resourceFailure(error), "disk_full")
    }
    func testPresenceRequiresStoredBytesAndChecksum() throws {
        let fixture = try ResourceFixture()
        defer { fixture.close() }
        let good = digest(Data("valid bytes".utf8))
        let corrupt = digest(Data("original bytes".utf8))
        try fixture.insert(good, bytes: Data("valid bytes".utf8))
        try fixture.insert(corrupt, bytes: Data("corrupt bytes".utf8))
        let missing = String(repeating: "c", count: 64)
        let result = try reply(fixture.source, hashes: [good, corrupt, missing])
        XCTAssertEqual(result["provider_device_id"] as? String, "stable-provider")
        let claims = try XCTUnwrap(result["resources"] as? [[String: Any]])
        XCTAssertEqual(claims.compactMap { $0["status"] as? String }, ["available", "checksum_mismatch", "missing"])
    }

    func testAvailabilityRevokesLostBytes() throws {
        let fixture = try ResourceFixture()
        defer { fixture.close() }
        let hash = digest(Data("present".utf8))
        try fixture.insert(hash, bytes: Data("present".utf8))
        let first = try reply(fixture.source, hashes: [hash])
        XCTAssertEqual((first["resources"] as? [[String: Any]])?.first?["status"] as? String, "available")
        try fixture.execute("DELETE FROM content_blob_data")
        let second = try reply(fixture.source, hashes: [hash])
        XCTAssertEqual((second["resources"] as? [[String: Any]])?.first?["status"] as? String, "missing")
    }

    func testRejectsOversizedAndDuplicateAvailabilityBeforeReadingResources() throws {
        let fixture = try ResourceFixture()
        defer { fixture.close() }
        let hash = String(repeating: "a", count: 64)
        XCTAssertThrowsError(try reply(fixture.source, hashes: [hash, hash]))
        XCTAssertThrowsError(try reply(fixture.source, hashes: Array(repeating: hash, count: 33)))
    }

    func testAttachmentSenderReadsOnlyRequestedRangesAndReportsTotalLength() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("t267-\(UUID().uuidString).png")
        let bytes = Data(repeating: 0x31, count: 1_048_576) + Data(repeating: 0x42, count: 7)
        try bytes.write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        XCTAssertEqual(try FolioleCompanionSyncGroupResources.readAttachmentRange(url,
            offset: 0, count: 1_048_576), bytes.prefix(1_048_576))
        XCTAssertEqual(try FolioleCompanionSyncGroupResources.readAttachmentRange(url,
            offset: 1_048_576, count: 7), bytes.suffix(7))
        XCTAssertThrowsError(try FolioleCompanionSyncGroupResources.readAttachmentRange(url,
            offset: 1_048_576, count: 8))
        let response = FolioleCompanionHttpMessage.response(status: 200,
            contentType: "application/octet-stream", body: Data(bytes.suffix(7)),
            totalBytes: bytes.count)
        XCTAssertTrue(String(decoding: response.prefix(200), as: UTF8.self)
            .contains("X-Foliole-Resource-Total-Bytes: 1048583"))
    }

    private func reply(_ snapshot: URL, hashes: [String]) throws -> [String: Any] {
        let request = try JSONSerialization.data(withJSONObject: ["resources": hashes.map { ["kind": "content_blob", "id": $0] }])
        let body = try FolioleCompanionResourceAvailability.reply(snapshot: snapshot, request: request, deviceId: "stable-provider")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
    }

    private func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
}

private final class ResourceFixture {
    let source: URL
    private var database: OpaquePointer?
    init() throws {
        source = FileManager.default.temporaryDirectory.appendingPathComponent("t203-\(UUID().uuidString).db")
        guard sqlite3_open(source.path, &database) == SQLITE_OK else { throw NSError(domain: "ResourceFixture", code: 1) }
        try execute("CREATE TABLE content_blobs(hash TEXT, mime_type TEXT, stored_sha256 TEXT, stored_size_bytes INTEGER)")
        try execute("CREATE TABLE content_blob_data(hash TEXT, data BLOB)")
    }
    func insert(_ hash: String, bytes: Data) throws {
        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        try execute("INSERT INTO content_blobs VALUES ('\(hash)', 'text/plain', '\(hash)', \(bytes.count))")
        try execute("INSERT INTO content_blob_data VALUES ('\(hash)', X'\(hex)')")
    }
    func execute(_ sql: String) throws {
        guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else { throw NSError(domain: "ResourceFixture", code: 2) }
    }
    func close() { sqlite3_close(database); try? FileManager.default.removeItem(at: source) }
}
