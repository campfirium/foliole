import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleCompanionDeviceAnchorStoreTests: XCTestCase {
    func testRestartUpgradeAndDatabaseSwitchKeepOneAnchor() throws {
        let fixture = try makeFixture()
        let first = try fixture.store.loadOrCreate()
        let restarted = try FolioleCompanionDeviceAnchorStore(
            defaults: fixture.defaults, keychain: fixture.keychain
        ).loadOrCreate()

        XCTAssertEqual(first, restarted)
        XCTAssertNotEqual(
            try FolioleCompanionDeviceAnchorStore.canonicalLibraryPath("/library-a/Data/foliole.db"),
            try FolioleCompanionDeviceAnchorStore.canonicalLibraryPath("/library-b/Data/foliole.db")
        )
    }

    func testFreshInstallRetiresAnyPreservedKeychainAnchor() throws {
        let fixture = try makeFixture()
        fixture.keychain.value = "11111111-1111-4111-8111-111111111111"

        let created = try fixture.store.loadOrCreate()

        XCTAssertNotEqual(created, "11111111-1111-4111-8111-111111111111")
        XCTAssertEqual(fixture.keychain.deletes, 1)
    }

    func testRestoredMarkerWithoutThisDeviceOnlyItemCreatesNewAnchor() throws {
        let fixture = try makeFixture()
        _ = try fixture.store.loadOrCreate()
        fixture.keychain.value = nil

        let restored = try fixture.store.loadOrCreate()

        XCTAssertEqual(fixture.keychain.value, restored)
    }

    func testCorruptAnchorFailsClosed() throws {
        let fixture = try makeFixture()
        _ = try fixture.store.loadOrCreate()
        fixture.keychain.value = "corrupt"

        XCTAssertThrowsError(try fixture.store.loadOrCreate())
    }

    private func makeFixture() throws -> AnchorFixture {
        let suite = "foliole-device-anchor-tests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let keychain = MemoryDeviceAnchorKeychain()
        return AnchorFixture(defaults: defaults, keychain: keychain,
            store: FolioleCompanionDeviceAnchorStore(defaults: defaults, keychain: keychain))
    }
}

private struct AnchorFixture {
    let defaults: UserDefaults
    let keychain: MemoryDeviceAnchorKeychain
    let store: FolioleCompanionDeviceAnchorStore
}

private final class MemoryDeviceAnchorKeychain: FolioleCompanionDeviceAnchorKeychain {
    var deletes = 0
    var value: String?
    func delete() throws { deletes += 1; value = nil }
    func load() throws -> String? { value }
    func save(_ value: String) throws { self.value = value }
}
