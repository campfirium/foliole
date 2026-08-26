import Foundation
import Security

protocol FolioleCompanionPairingSecretStore {
    func delete() throws
    func load() throws -> String?
    func save(_ secret: String) throws
}

final class FolioleCompanionKeychainSecretStore: FolioleCompanionPairingSecretStore {
    private let account = "device-secret"
    private let service: String

    init(service: String) {
        self.service = service
    }

    func delete() throws {
        let status = SecItemDelete(query() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw error(status) }
    }

    func load() throws -> String? {
        var result: CFTypeRef?
        var request = query()
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data, let secret = String(data: data, encoding: .utf8) else {
            throw error(status)
        }
        return secret
    }

    func save(_ secret: String) throws {
        guard let data = secret.data(using: .utf8) else { throw error(errSecParam) }
        let updated = SecItemUpdate(query() as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw error(updated) }
        var request = query()
        request[kSecValueData as String] = data
        request[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(request as CFDictionary, nil)
        guard added == errSecSuccess else { throw error(added) }
    }

    private func query() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecAttrService as String: service
        ]
    }

    private func error(_ status: OSStatus) -> NSError {
        NSError(
            domain: "FolioleCompanionKeychain",
            code: Int(status),
            userInfo: [NSLocalizedDescriptionKey: SecCopyErrorMessageString(status, nil) as String? ?? "Keychain error \(status)"]
        )
    }
}
