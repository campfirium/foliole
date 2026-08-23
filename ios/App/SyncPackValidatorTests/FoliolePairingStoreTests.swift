import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FoliolePairingStoreTests: XCTestCase {
    func testLoadingStateRetiresLegacyGlobalRolePreference() throws {
        let fixture = try makeFixture()
        fixture.defaults.set("legacy-desktop", forKey: "primary_device_id")

        _ = try fixture.store.loadState()

        XCTAssertNil(fixture.defaults.object(forKey: "primary_device_id"))
    }

    func testPersistsMetadataSignsNativelyAndKeepsSecretOutOfDefaults() throws {
        let fixture = try makeFixture()
        let protocolVersion = fixture.contract.protocolVersion
        let saved = try fixture.store.save(
            authorizationId: "authorization-ios",
            credentialSecret: "pair-secret",
            hostName: "iPhone",
            hostPlatform: "ios-capacitor",
            negotiatedProtocolVersion: protocolVersion,
            pairedAt: "2026-07-19T10:00:00.000Z",
            remotePeerId: "desktop-device",
            remotePeerName: "Foliole Desktop on Mac",
            remotePeerPlatform: "macOS",
            remoteProtocol: compatibleProtocol(version: protocolVersion)
        )

        XCTAssertEqual(saved[fixture.contract.stateKeys["isPaired"]!] as? Bool, true)
        XCTAssertEqual(saved[fixture.contract.stateKeys["remotePeerName"]!] as? String, "Foliole Desktop on Mac")
        XCTAssertEqual(saved[fixture.contract.stateKeys["syncUsable"]!] as? Bool, true)
        XCTAssertFalse(fixture.contract.preferenceKeys.values.contains("device_secret"))

        let signature = try fixture.store.sign(
            method: "GET",
            path: "/companion/sync-pack?after_state_seq=0",
            timestamp: "2026-07-19T10:00:00.000Z",
            nonce: "nonce-1",
            bodyHash: "body-hash"
        )
        let headers = try XCTUnwrap(signature[fixture.contract.signatureResponseKeys["headers"]!] as? [String: String])
        XCTAssertEqual(headers[fixture.contract.signatureHeaderKeys["authorizationId"]!], "authorization-ios")
        XCTAssertEqual(
            headers[fixture.contract.signatureHeaderKeys["signature"]!],
            "03d1ca1f98ef9f6b9641ae5da032eb8477e9741ffb383d387e8b3aabb665a2a5"
        )
    }

    func testClearRemovesSecretAndPermanentPairingMetadata() throws {
        let fixture = try makeFixture()
        let protocolVersion = fixture.contract.protocolVersion
        _ = try fixture.store.save(
            authorizationId: "authorization-ios",
            credentialSecret: "pair-secret",
            hostName: "iPhone",
            hostPlatform: "ios-capacitor",
            negotiatedProtocolVersion: protocolVersion,
            pairedAt: "2026-07-19T10:00:00.000Z",
            remotePeerId: "desktop-device",
            remotePeerName: "Foliole Desktop on Mac",
            remotePeerPlatform: "macOS",
            remoteProtocol: compatibleProtocol(version: protocolVersion)
        )

        let cleared = try fixture.store.clear()
        XCTAssertEqual(cleared[fixture.contract.stateKeys["isPaired"]!] as? Bool, false)
        XCTAssertNil(try fixture.secrets.load())
        XCTAssertTrue(fixture.contract.preferenceKeys.values.allSatisfy {
            fixture.defaults.object(forKey: $0) == nil
        })
    }

    func testRejectsIncompatibleProtocolBeforePersistingCredentials() throws {
        let fixture = try makeFixture()
        let incompatibleVersion = fixture.contract.protocolVersion + 1
        XCTAssertThrowsError(try fixture.store.save(
            authorizationId: "authorization-ios",
            credentialSecret: "pair-secret",
            hostName: "iPhone",
            hostPlatform: "ios-capacitor",
            negotiatedProtocolVersion: incompatibleVersion,
            pairedAt: "2026-07-19T10:00:00.000Z",
            remotePeerId: nil,
            remotePeerName: nil,
            remotePeerPlatform: nil,
            remoteProtocol: compatibleProtocol(version: incompatibleVersion)
        ))
        XCTAssertNil(try fixture.secrets.load())
    }

    func testLegacyCredentialCutsOverOnceAndHostRenameKeepsAuthorizationAndSecret() throws {
        let fixture = try makeFixture()
        fixture.defaults.set("legacy-ios-device", forKey: fixture.contract.legacyPreferenceKeys["deviceId"]!)
        fixture.defaults.set("Old iPhone", forKey: fixture.contract.legacyPreferenceKeys["deviceName"]!)
        fixture.defaults.set("ios-capacitor", forKey: fixture.contract.legacyPreferenceKeys["deviceKind"]!)
        try fixture.secrets.save("legacy-secret")

        let migrated = try fixture.store.loadState()
        XCTAssertEqual(migrated[fixture.contract.stateKeys["authorizationId"]!] as? String, "legacy-ios-device")
        XCTAssertEqual(migrated[fixture.contract.stateKeys["hostName"]!] as? String, "Old iPhone")
        XCTAssertTrue(fixture.contract.legacyPreferenceKeys.values.allSatisfy {
            fixture.defaults.object(forKey: $0) == nil
        })

        fixture.defaults.set("Renamed iPhone", forKey: fixture.contract.preferenceKeys["hostName"]!)
        let renamed = try fixture.store.loadState()
        XCTAssertEqual(renamed[fixture.contract.stateKeys["authorizationId"]!] as? String, "legacy-ios-device")
        XCTAssertEqual(renamed[fixture.contract.stateKeys["hostName"]!] as? String, "Renamed iPhone")
        XCTAssertEqual(try fixture.secrets.load(), "legacy-secret")
    }

    private func makeFixture() throws -> PairingFixture {
        let contract = try FolioleCompanionContractStore(bundle: .module).pairingContract()
        let suite = "foliole-ios-pairing-tests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let secrets = InMemorySecretStore()
        return PairingFixture(
            contract: contract,
            defaults: defaults,
            secrets: secrets,
            suite: suite,
            store: try FolioleCompanionPairingStore(contract: contract, defaults: defaults, secrets: secrets)
        )
    }

    private func compatibleProtocol(version: Int) -> [String: Any] {
        [
            "version": version,
            "min_supported_version": version,
            "max_supported_version": version,
            "capabilities": []
        ]
    }
}

private struct PairingFixture {
    let contract: FolioleCompanionPairingContract
    let defaults: UserDefaults
    let secrets: InMemorySecretStore
    let suite: String
    let store: FolioleCompanionPairingStore
}

private final class InMemorySecretStore: FolioleCompanionPairingSecretStore {
    private var value: String?
    func delete() throws { value = nil }
    func load() throws -> String? { value }
    func save(_ secret: String) throws { value = secret }
}
