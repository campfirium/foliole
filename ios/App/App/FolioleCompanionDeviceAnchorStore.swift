import Foundation
import Security

protocol FolioleCompanionDeviceAnchorKeychain {
    func delete() throws
    func load() throws -> String?
    func save(_ value: String) throws
}

final class FolioleCompanionDeviceAnchorStore {
    private static let markerKey = "foliole.device-anchor.installation-marker.v1"
    private let defaults: UserDefaults
    private let keychain: FolioleCompanionDeviceAnchorKeychain

    init(
        defaults: UserDefaults = .standard,
        keychain: FolioleCompanionDeviceAnchorKeychain = FolioleDeviceAnchorSystemKeychain()
    ) {
        self.defaults = defaults
        self.keychain = keychain
    }

    func loadOrCreate() throws -> String {
        if !defaults.bool(forKey: Self.markerKey) {
            try keychain.delete()
            return try create()
        }
        if let stored = try keychain.load() {
            return try Self.validate(stored)
        }
        return try create()
    }

    static func canonicalLibraryPath(
        _ value: String,
        homeDirectory: String = NSHomeDirectory()
    ) throws -> String {
        let canonical = try canonicalAbsolutePath(value)
        let home = try canonicalAbsolutePath(homeDirectory)
        guard canonical == home || canonical.hasPrefix("\(home)/") else { return canonical }
        let relative = canonical.dropFirst(home.count)
        return relative.isEmpty ? "/" : String(relative)
    }

    private func create() throws -> String {
        let anchor = UUID().uuidString.lowercased()
        _ = try Self.validate(anchor)
        try keychain.save(anchor)
        defaults.set(true, forKey: Self.markerKey)
        return anchor
    }

    private static func validate(_ value: String) throws -> String {
        let pattern = "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        guard value.range(of: pattern, options: .regularExpression) != nil else {
            throw invalid("device_anchor_invalid")
        }
        return value
    }

    private static func canonicalAbsolutePath(_ value: String) throws -> String {
        guard value.hasPrefix("/") else { throw invalid("library_path_not_absolute") }
        return URL(fileURLWithPath: value).resolvingSymlinksInPath().standardizedFileURL.path
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleDeviceAnchor", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}

final class FolioleDeviceAnchorSystemKeychain: FolioleCompanionDeviceAnchorKeychain {
    private let account = "device-anchor-v1"
    private let service = "com.foliole.ios.device-anchor"

    func delete() throws {
        let status = SecItemDelete(query() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw error(status) }
    }

    func load() throws -> String? {
        var request = query()
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8)
        else { throw error(status) }
        return value
    }

    func save(_ value: String) throws {
        let data = Data(value.utf8)
        let updated = SecItemUpdate(query() as CFDictionary,
            [kSecValueData as String: data] as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw error(updated) }
        var request = query()
        request[kSecValueData as String] = data
        request[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(request as CFDictionary, nil)
        guard added == errSecSuccess else { throw error(added) }
    }

    private func query() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrAccount as String: account,
         kSecAttrService as String: service]
    }

    private func error(_ status: OSStatus) -> NSError {
        NSError(domain: "FolioleDeviceAnchorKeychain", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey:
                    SecCopyErrorMessageString(status, nil) as String? ?? "Keychain error"])
    }
}
