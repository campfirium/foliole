import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FoliolePairingStoreTests: XCTestCase {
    func testPersistsMetadataSignsNativelyAndKeepsSecretOutOfDefaults() throws {
        let fixture = try makeFixture()
        let saved = try fixture.store.save(
            deviceId: "ios-device",
            deviceKind: "ios-capacitor",
            deviceName: "iPhone",
            deviceSecret: "pair-secret",
            negotiatedProtocolVersion: 1,
            pairedAt: "2026-07-19T10:00:00.000Z",
            primaryDeviceId: "desktop-device",
            remotePeerId: "desktop-device",
            remotePeerName: "Foliole Desktop on Mac",
            remotePeerPlatform: "macOS",
            remoteProtocol: ["version": 1, "min_supported_version": 1, "max_supported_version": 1, "capabilities": []]
        )

        XCTAssertEqual(saved[fixture.contract.stateKeys["isPaired"]!] as? Bool, true)
        XCTAssertEqual(saved[fixture.contract.stateKeys["remotePeerName"]!] as? String, "Foliole Desktop on Mac")
        XCTAssertEqual(saved[fixture.contract.stateKeys["syncUsable"]!] as? Bool, true)
        XCTAssertNil(fixture.defaults.object(forKey: fixture.contract.preferenceKeys["deviceSecret"]!))

        let signature = try fixture.store.sign(
            method: "GET",
            path: "/companion/sync-pack?after_state_seq=0",
            timestamp: "2026-07-19T10:00:00.000Z",
            nonce: "nonce-1",
            bodyHash: "body-hash"
        )
        let headers = try XCTUnwrap(signature[fixture.contract.signatureResponseKeys["headers"]!] as? [String: String])
        XCTAssertEqual(headers[fixture.contract.signatureHeaderKeys["deviceId"]!], "ios-device")
        XCTAssertEqual(
            headers[fixture.contract.signatureHeaderKeys["signature"]!],
            "03d1ca1f98ef9f6b9641ae5da032eb8477e9741ffb383d387e8b3aabb665a2a5"
        )
    }

    func testClearRemovesSecretAndPermanentPairingMetadata() throws {
        let fixture = try makeFixture()
        _ = try fixture.store.save(
            deviceId: "ios-device",
            deviceKind: "ios-capacitor",
            deviceName: "iPhone",
            deviceSecret: "pair-secret",
            negotiatedProtocolVersion: 1,
            pairedAt: "2026-07-19T10:00:00.000Z",
            primaryDeviceId: "desktop-device",
            remotePeerId: "desktop-device",
            remotePeerName: "Foliole Desktop on Mac",
            remotePeerPlatform: "macOS",
            remoteProtocol: ["version": 1]
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
        XCTAssertThrowsError(try fixture.store.save(
            deviceId: "ios-device",
            deviceKind: "ios-capacitor",
            deviceName: "iPhone",
            deviceSecret: "pair-secret",
            negotiatedProtocolVersion: 2,
            pairedAt: "2026-07-19T10:00:00.000Z",
            primaryDeviceId: "desktop-device",
            remotePeerId: nil,
            remotePeerName: nil,
            remotePeerPlatform: nil,
            remoteProtocol: ["version": 2]
        ))
        XCTAssertNil(try fixture.secrets.load())
    }

    func testPrimaryDeviceUpdatePersistsAcrossStoreReloadWithoutChangingSecret() throws {
        let fixture = try makeFixture()
        _ = try fixture.store.save(
            deviceId: "ios-device",
            deviceKind: "ios-capacitor",
            deviceName: "iPhone",
            deviceSecret: "pair-secret",
            negotiatedProtocolVersion: 1,
            pairedAt: "2026-07-19T10:00:00.000Z",
            primaryDeviceId: "desktop-old",
            remotePeerId: nil,
            remotePeerName: nil,
            remotePeerPlatform: nil,
            remoteProtocol: ["version": 1]
        )

        _ = try fixture.store.savePrimaryDeviceId("desktop-new")
        let reloadedDefaults = try XCTUnwrap(UserDefaults(suiteName: fixture.suite))
        let reloadedStore = try FolioleCompanionPairingStore(
            contract: fixture.contract,
            defaults: reloadedDefaults,
            secrets: fixture.secrets
        )
        let reloaded = try reloadedStore.loadState()

        XCTAssertEqual(reloaded[fixture.contract.stateKeys["primaryDeviceId"]!] as? String, "desktop-new")
        XCTAssertEqual(try fixture.secrets.load(), "pair-secret")
        XCTAssertThrowsError(try reloadedStore.savePrimaryDeviceId("  "))
        XCTAssertEqual(
            try reloadedStore.loadState()[fixture.contract.stateKeys["primaryDeviceId"]!] as? String,
            "desktop-new"
        )
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
