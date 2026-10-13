import CryptoKit
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleSyncGroupProviderDataPlaneTests: XCTestCase {
    func testAuthenticatedProviderRequestRejectsReplay() throws {
        let key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let nonce = UUID().uuidString.lowercased()
        let body = Data()
        let canonical = ["GET", "/companion/framed-sync?request=inventory", timestamp, nonce,
            SHA256.hash(data: body).map { String(format: "%02x", $0) }.joined()].joined(separator: "\n")
        let signature = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8), using: SymmetricKey(data: Data(key.utf8))
        ).map { String(format: "%02x", $0) }.joined()
        let request = FolioleCompanionHttpMessage(body: [:], bodyData: body, headers: [
            "x-device-id": "device-b", "x-nonce": nonce, "x-signature": signature,
            "x-sync-group-id": "group-a", "x-timestamp": timestamp
        ], method: "GET", path: "/companion/framed-sync?request=inventory")
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
        let path = "/companion/framed-sync?request=inventory"
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

    func testRetiredIdentityRoutesDoNotAllowLargeBodies() throws {
        let payload = String(repeating: "a", count: 1_500_000)
        func request(_ route: String) -> Data {
            Data("POST \(route) HTTP/1.1\r\nContent-Length: \(payload.count)\r\n\r\n\(payload)".utf8)
        }
        let push = request("/companion/sync-identity-push")
        XCTAssertThrowsError(try FolioleCompanionHttpMessage.expectedLength(push))
        XCTAssertThrowsError(try FolioleCompanionHttpMessage.expectedLength(
            request("/companion/sync-identity-pack")))
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
