import CryptoKit
import Foundation
import Security

final class FolioleCompanionSyncGroupLifecycleKeyStore {
    private let service = "foliole_sync_group_join_intent_v1"

    func create(_ requestId: String) throws -> String {
        let privateKey: P256.KeyAgreement.PrivateKey
        if let stored = try load(requestId) {
            privateKey = try P256.KeyAgreement.PrivateKey(rawRepresentation: stored)
        } else {
            privateKey = P256.KeyAgreement.PrivateKey()
            try save(requestId, privateKey.rawRepresentation)
        }
        return Self.base64URL(privateKey.publicKey.x963Representation)
    }

    func decrypt(_ requestId: String, payload: [String: Any]) throws -> String {
        guard let stored = try load(requestId) else { throw Self.invalid("join intent key not found") }
        let privateKey = try P256.KeyAgreement.PrivateKey(rawRepresentation: stored)
        let server = try P256.KeyAgreement.PublicKey(x963Representation: Self.data(payload, "server_public_key"))
        let shared = try privateKey.sharedSecretFromKeyAgreement(with: server)
        let salt = try Self.data(payload, "salt")
        let key = shared.hkdfDerivedSymmetricKey(using: SHA256.self,
            salt: salt, sharedInfo: Data("Foliole companion pairing v1".utf8),
            outputByteCount: 32)
        let encrypted = try Self.data(payload, "ciphertext")
        guard encrypted.count > 16 else { throw Self.invalid("route grant ciphertext") }
        let ciphertext = encrypted.dropLast(16)
        let tag = encrypted.suffix(16)
        let sealed = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: Self.data(payload, "iv")),
            ciphertext: ciphertext, tag: tag)
        guard let secret = String(data: try AES.GCM.open(sealed, using: key), encoding: .utf8), !secret.isEmpty else {
            throw Self.invalid("route grant secret")
        }
        return secret
    }

    func remove(_ requestId: String) throws -> Bool {
        let status = SecItemDelete(query(requestId) as CFDictionary)
        if status == errSecItemNotFound { return false }
        guard status == errSecSuccess else { throw Self.error(status) }
        return true
    }

    private func load(_ requestId: String) throws -> Data? {
        var request = query(requestId)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw Self.error(status) }
        return data
    }

    private func save(_ requestId: String, _ data: Data) throws {
        let updated = SecItemUpdate(query(requestId) as CFDictionary,
            [kSecValueData as String: data] as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw Self.error(updated) }
        var request = query(requestId)
        request[kSecValueData as String] = data
        request[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(request as CFDictionary, nil)
        guard added == errSecSuccess else { throw Self.error(added) }
    }

    private func query(_ requestId: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrAccount as String: requestId,
         kSecAttrService as String: service]
    }

    private static func data(_ payload: [String: Any], _ key: String) throws -> Data {
        guard let value = payload[key] as? String else { throw invalid(key) }
        return try base64URL(value)
    }

    private static func base64URL(_ value: String) throws -> Data {
        var encoded = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        guard let data = Data(base64Encoded: encoded) else { throw invalid("base64url") }
        return data
    }

    private static func base64URL(_ value: Data) -> String {
        value.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    private static func invalid(_ value: String) -> NSError {
        NSError(domain: "FolioleSyncGroupLifecycleKey", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid \(value)."])
    }

    private static func error(_ status: OSStatus) -> NSError {
        NSError(domain: "FolioleSyncGroupLifecycleKey", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: SecCopyErrorMessageString(status, nil) as String? ?? "Keychain error"])
    }
}
