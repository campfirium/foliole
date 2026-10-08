import CryptoKit
import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleCompanionMemberStateReadinessTests: XCTestCase {
    private let key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

    func testRejectedAuthenticatedExchangeRevokesPriorReadyPeer() throws {
        let provider = try FolioleCompanionSyncGroupJoinProvider(groupInfo: [
            "display_name": "Test", "group_id": "group-a", "workgroup_key": key
        ])
        let server = try FolioleCompanionSyncGroupJoinServer(discovery: [
            "group_tag": FolioleCompanionSyncGroupSecurity.groupTag(key)
        ], provider: provider, stateChanged: {})
        let bridge = ReadinessBridge()
        _ = try server.acceptMemberState(memberRequest(), bridge: bridge)
        XCTAssertEqual(try server.authenticate(framedRequest(), bridge: bridge), "device-b")
        bridge.reject = true
        XCTAssertThrowsError(try server.acceptMemberState(memberRequest(), bridge: bridge))
        XCTAssertNil(server.memberStateReady["device-b"])
        XCTAssertThrowsError(try server.authenticate(framedRequest(), bridge: bridge)) { error in
            XCTAssertEqual(error.localizedDescription, "sync_group_member_state_required")
        }
    }

    private func memberRequest() throws -> FolioleCompanionHttpMessage {
        let body = "{}"
        let prepared = try FolioleCompanionSignedClientRequests.prepare(
            body: body, bodyHash: digest(Data(body.utf8)), endpointUrl: "http://local.test",
            groupId: "group-a", method: "POST", nonce: UUID().uuidString.lowercased(),
            path: "/sync-group/member-state", timestamp: ISO8601DateFormatter().string(from: Date()),
            deviceId: "device-b", workgroupKey: key)
        let bytes = Data(try XCTUnwrap(prepared["body"] as? String).utf8)
        return .init(body: try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any]), bodyData: bytes,
            headers: Dictionary(uniqueKeysWithValues: try XCTUnwrap(prepared["headers"] as? [String: String])
                .map { ($0.key.lowercased(), $0.value) }), method: "POST", path: "/sync-group/member-state")
    }

    private func framedRequest() -> FolioleCompanionHttpMessage {
        let timestamp = ISO8601DateFormatter().string(from: Date()), nonce = UUID().uuidString.lowercased()
        let path = "/companion/framed-sync"
        let canonical = ["POST", path, timestamp, nonce, digest(Data())].joined(separator: "\n")
        let signature = HMAC<SHA256>.authenticationCode(for: Data(canonical.utf8),
            using: SymmetricKey(data: Data(key.utf8))).map { String(format: "%02x", $0) }.joined()
        return .init(body: [:], bodyData: Data(), headers: [
            "x-device-id": "device-b", "x-nonce": nonce, "x-signature": signature,
            "x-sync-group-id": "group-a", "x-timestamp": timestamp
        ], method: "POST", path: path)
    }

    private func digest(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}

private final class ReadinessBridge: FolioleCompanionSyncGroupDataRequesting {
    var reject = false
    func request(_ operation: String, _ payload: [String: Any]) throws -> [String: Any] {
        switch operation {
        case "verify_device": return ["active": true]
        case "load_member_state": return [:]
        case "apply_member_state":
            if reject { throw NSError(domain: "incompatible", code: 1) }
            return ["state": [:], "normal_sync_ready": true]
        default: throw NSError(domain: "unexpected-operation", code: 1)
        }
    }
}
