import CryptoKit
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleSyncGroupJoinProviderTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_788_000_000)

    func testAcceptanceOnlyEncryptsExactGroupInfoAndClearsEphemeralState() throws {
        let requester = P256.KeyAgreement.PrivateKey()
        let provider = try FolioleCompanionSyncGroupJoinProvider(groupInfo: groupInfo())
        let received = try provider.receive(request(publicKey: requester.publicKey.x963Representation), now: now)
        let requestId = try XCTUnwrap(received["request_id"] as? String)

        XCTAssertNil(try provider.collect(requestId, now: now))
        let accepted = try provider.accept(requestId, now: now.addingTimeInterval(1))
        XCTAssertFalse(String(describing: accepted).contains("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"))
        let collected = try XCTUnwrap(provider.collect(requestId, now: now.addingTimeInterval(2)))
        XCTAssertEqual(try decrypt(collected, requester: requester), groupInfo())
        XCTAssertNil(try provider.collect(requestId, now: now.addingTimeInterval(3)))
    }

    func testRejectTimeoutAndRestartRemoveTemporaryRequests() throws {
        let service = FolioleCompanionSyncGroupJoinService()
        try service.install(groupInfo: groupInfo())
        let requester = P256.KeyAgreement.PrivateKey()
        let request = try service.withProvider { try $0.receive(
            self.request(publicKey: requester.publicKey.x963Representation), now: self.now
        ) }
        let requestId = try XCTUnwrap(request["request_id"] as? String)
        XCTAssertTrue(try service.withProvider { try $0.reject(requestId, now: now) })
        _ = try service.withProvider { try $0.receive(
            self.request(publicKey: requester.publicKey.x963Representation), now: self.now
        ) }
        XCTAssertEqual(try service.withProvider {
            $0.pending(now: now.addingTimeInterval(121)).count
        }, 0)
        service.clearForRestart()
        XCTAssertThrowsError(try service.withProvider { $0.pending(now: self.now) })
    }

    func testMalformedPayloadsFailClosed() throws {
        let key = P256.KeyAgreement.PrivateKey().publicKey.x963Representation
        var extra = request(publicKey: key); extra["unexpected"] = true
        XCTAssertThrowsError(try provider().receive(extra, now: now))
        var wrongGroup = request(publicKey: key); wrongGroup["group_id"] = "group-b"
        XCTAssertThrowsError(try provider().receive(wrongGroup, now: now))
        var paddedKey = request(publicKey: key); paddedKey["ephemeral_public_key"] = Base64URL.encode(key) + "="
        XCTAssertThrowsError(try provider().receive(paddedKey, now: now))
    }

    private func provider() throws -> FolioleCompanionSyncGroupJoinProvider {
        try FolioleCompanionSyncGroupJoinProvider(groupInfo: groupInfo())
    }

    private func groupInfo() -> [String: String] {
        ["display_name": "My Sync Group", "group_id": "group-a",
         "workgroup_key": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"]
    }

    private func request(publicKey: Data) -> [String: Any] {
        ["contract_version": 1, "device": [
            "canonical_library_path": "/Library/Application Support/Foliole/foliole.db",
            "device_anchor": "a1111111-1111-4111-8111-111111111111",
            "device_name": "iPhone", "path_flavor": "posix", "platform": "ios"
        ], "ephemeral_public_key": Base64URL.encode(publicKey), "group_id": "group-a"]
    }

    private func decrypt(_ acceptance: [String: Any], requester: P256.KeyAgreement.PrivateKey) throws -> [String: String] {
        let envelope = try XCTUnwrap(acceptance["encrypted_group_info"] as? [String: Any])
        let server = try P256.KeyAgreement.PublicKey(x963Representation: try decode(envelope, "server_public_key"))
        let shared = try requester.sharedSecretFromKeyAgreement(with: server)
        let key = shared.hkdfDerivedSymmetricKey(using: SHA256.self, salt: try decode(envelope, "salt"),
            sharedInfo: Data("Foliole companion pairing v1".utf8), outputByteCount: 32)
        let combined = try decode(envelope, "ciphertext")
        let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: try decode(envelope, "iv")),
            ciphertext: combined.dropLast(16), tag: combined.suffix(16))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: AES.GCM.open(box, using: key)) as? [String: String])
    }

    private func decode(_ value: [String: Any], _ key: String) throws -> Data {
        try Base64URL.decode(try XCTUnwrap(value[key] as? String))
    }
}
