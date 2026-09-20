import CryptoKit
import Foundation
import SQLite3
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleResourceProviderTests: XCTestCase {
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

    func testAvailabilityRefreshesAnUnseenPeerAndRevokesLostBytesWithoutAPack() throws {
        let fixture = try ResourceFixture()
        defer { fixture.close() }
        let hash = digest(Data("present".utf8))
        try fixture.insert(hash, bytes: Data("present".utf8))
        let snapshots = FolioleCompanionSyncGroupSnapshot(bridge: SnapshotBridge(source: fixture.source))
        defer { snapshots.close() }
        XCTAssertThrowsError(try snapshots.read("new-peer") { $0 })
        let first = try snapshots.refresh("new-peer") { try reply($0, hashes: [hash]) }
        XCTAssertEqual((first["resources"] as? [[String: Any]])?.first?["status"] as? String, "available")
        try fixture.execute("DELETE FROM content_blob_data")
        let second = try snapshots.refresh("new-peer") { try reply($0, hashes: [hash]) }
        XCTAssertEqual((second["resources"] as? [[String: Any]])?.first?["status"] as? String, "missing")
    }

    func testMixedContentTransferKeepsOnlyVerifiedRequestedBytes() {
        let good = digest(Data("good".utf8)), corrupt = digest(Data("expected".utf8))
        let missing = String(repeating: "d", count: 64)
        let result = FolioleCompanionResourceTransferValidation.contentParts([
            .init(data: Data("good".utf8), hash: good), .init(data: Data("wrong".utf8), hash: corrupt),
            .init(data: Data("extra".utf8), hash: digest(Data("extra".utf8)))
        ], requested: [good, corrupt, missing])
        XCTAssertEqual(result.accepted.map(\.hash), [good])
        XCTAssertEqual(result.errors[corrupt], "checksum_mismatch")
        XCTAssertEqual(result.errors[missing], "missing_file")
    }

    func testRejectsOversizedAndDuplicateAvailabilityBeforeReadingResources() throws {
        let fixture = try ResourceFixture()
        defer { fixture.close() }
        let hash = String(repeating: "a", count: 64)
        XCTAssertThrowsError(try reply(fixture.source, hashes: [hash, hash]))
        XCTAssertThrowsError(try reply(fixture.source, hashes: Array(repeating: hash, count: 33)))
    }

    private func reply(_ snapshot: URL, hashes: [String]) throws -> [String: Any] {
        let request = try JSONSerialization.data(withJSONObject: ["resources": hashes.map { ["kind": "content_blob", "id": $0] }])
        let body = try FolioleCompanionResourceAvailability.reply(snapshot: snapshot, request: request, deviceId: "stable-provider")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
    }

    private func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
}

private struct SnapshotBridge: FolioleCompanionSyncGroupDataRequesting {
    let source: URL
    func request(_ operation: String, _ payload: [String: Any]) throws -> [String: Any] {
        guard operation == "create_snapshot", let target = payload["target_path"] as? String else {
            throw NSError(domain: "SnapshotFixture", code: 1)
        }
        try FileManager.default.copyItem(at: source, to: URL(fileURLWithPath: target))
        return ["snapshot_path": target]
    }
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
