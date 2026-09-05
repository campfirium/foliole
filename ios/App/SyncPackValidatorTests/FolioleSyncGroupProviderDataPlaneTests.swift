import CryptoKit
import XCTest
import ZIPFoundation
@testable import FolioleSyncPackValidator

final class FolioleSyncGroupProviderDataPlaneTests: XCTestCase {
    func testProviderDefinitionsCarryTheActiveSyncPackContract() throws {
        let definitions = try FolioleCompanionSyncPackProviderDefinitions.load()
        try definitions.validate()
        XCTAssertEqual(definitions.format, "foliole.sync-pack")
        XCTAssertEqual(definitions.formatVersion, 12)
        XCTAssertEqual(definitions.schemaVersion, 78)
        XCTAssertTrue(definitions.copyStatements.contains { $0.contains("sync_group_devices") })
        XCTAssertFalse(definitions.copyStatements.contains { $0.contains("sync_group_members") })
    }

    func testPreparedCompleteMemberCapabilityDoesNotChangeProductionV4() throws {
        let definitions = try FolioleCompanionSyncPackProviderDefinitions.load()
        let production = definitions.value["protocol"] as? [String: Any]
        let prepared = definitions.preparedMemberDataPlane
        let preparedProtocol = prepared["protocol"] as? [String: Any]
        let productionCapabilities = production?["capabilities"] as? [String] ?? []
        let preparedCapabilities = preparedProtocol?["capabilities"] as? [String] ?? []

        XCTAssertEqual(production?["version"] as? Int, 4)
        XCTAssertFalse(productionCapabilities.contains("complete-member-data-plane"))
        XCTAssertEqual(preparedProtocol?["version"] as? Int, 4)
        XCTAssertTrue(preparedCapabilities.contains("complete-member-data-plane"))
        XCTAssertEqual(Set(prepared["resourceKinds"] as? [String] ?? []), ["attachment", "content_blob"])
    }

    func testAuthenticatedProviderRequestRejectsReplay() throws {
        let key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let nonce = UUID().uuidString.lowercased()
        let body = Data()
        let canonical = ["GET", "/companion/sync-pack?after_state_seq=0", timestamp, nonce,
            SHA256.hash(data: body).map { String(format: "%02x", $0) }.joined()].joined(separator: "\n")
        let signature = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8), using: SymmetricKey(data: Data(key.utf8))
        ).map { String(format: "%02x", $0) }.joined()
        let request = FolioleCompanionHttpMessage(body: [:], bodyData: body, headers: [
            "x-device-id": "device-b", "x-nonce": nonce, "x-signature": signature,
            "x-sync-group-id": "group-a", "x-timestamp": timestamp
        ], method: "GET", path: "/companion/sync-pack?after_state_seq=0")
        let bridge = ActiveDeviceBridge()
        XCTAssertEqual(try FolioleCompanionSyncGroupWorkgroup.authenticate(
            request, groupId: "group-a", workgroupKey: key, dataBridge: bridge
        ), "device-b")
        XCTAssertThrowsError(try FolioleCompanionSyncGroupWorkgroup.authenticate(
            request, groupId: "group-a", workgroupKey: key, dataBridge: bridge
        ))
    }

    func testAuthenticatedProviderRequestAcceptsDesktopFractionalTimestamp() throws {
        let key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let timestamp = formatter.string(from: Date())
        let nonce = UUID().uuidString.lowercased()
        let body = Data()
        let path = "/companion/sync-pack?after_state_seq=0"
        let canonical = ["GET", path, timestamp, nonce,
            SHA256.hash(data: body).map { String(format: "%02x", $0) }.joined()].joined(separator: "\n")
        let signature = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8), using: SymmetricKey(data: Data(key.utf8))
        ).map { String(format: "%02x", $0) }.joined()
        let request = FolioleCompanionHttpMessage(body: [:], bodyData: body, headers: [
            "x-device-id": "device-b", "x-nonce": nonce, "x-signature": signature,
            "x-sync-group-id": "group-a", "x-timestamp": timestamp
        ], method: "GET", path: path)

        XCTAssertEqual(try FolioleCompanionSyncGroupWorkgroup.authenticate(
            request, groupId: "group-a", workgroupKey: key, dataBridge: ActiveDeviceBridge()
        ), "device-b")
    }

    func testProviderArchiveUsesConsumerCompatibleZlibAndZip() throws {
        let plain = Data("provider database bytes".utf8)
        let compressed = try FolioleCompanionSyncPackArchive.deflate(plain)
        XCTAssertEqual(try FolioleCompanionZlib.inflate(compressed), plain)
        let archiveData = FolioleCompanionSyncPackArchive.zip(entries: [
            ("manifest.json", Data("{}".utf8)), ("incoming.db.deflate", compressed)
        ])
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).syncpack")
        defer { try? FileManager.default.removeItem(at: url) }
        try archiveData.write(to: url)
        let archive = try Archive(url: url, accessMode: .read)
        XCTAssertEqual(Set(archive.map(\.path)), ["manifest.json", "incoming.db.deflate"])
    }
}

private struct ActiveDeviceBridge: FolioleCompanionSyncGroupDataRequesting {
    func request(_ operation: String, _ payload: [String: Any]) throws -> [String: Any] {
        XCTAssertEqual(operation, "verify_device")
        XCTAssertEqual(payload["group_id"] as? String, "group-a")
        XCTAssertEqual(payload["device_id"] as? String, "device-b")
        return ["active": true]
    }
}
