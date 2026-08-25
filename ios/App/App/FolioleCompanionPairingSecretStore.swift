import Foundation
import Security
import CryptoKit

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

struct FolioleCompanionSyncGroupMemberRoute: Codable {
    let authorizationEpoch: Int
    let authorizationId: String
    let endpointHint: String?
    let groupId: String
    let localMemberId: String
    let peerMemberId: String
    let protocolVersion: Int
    let routeId: String
    let secret: String
}

final class FolioleCompanionSyncGroupMemberRouteStore {
    private let contract: FolioleCompanionSyncGroupAuthorizationContract
    private let service: String

    init(contract: FolioleCompanionSyncGroupAuthorizationContract) throws {
        guard let service = contract.storageKeys["memberKeyAlias"], !service.isEmpty else {
            throw Self.invalid("memberKeyAlias")
        }
        self.contract = contract
        self.service = service
    }

    func load(_ routeId: String) throws -> FolioleCompanionSyncGroupMemberRoute? {
        var request = query(routeId)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw Self.error(status) }
        let route = try JSONDecoder().decode(FolioleCompanionSyncGroupMemberRoute.self, from: data)
        guard route.routeId == routeId, route.authorizationEpoch > 0, route.protocolVersion == 4 else {
            throw Self.invalid("route metadata")
        }
        return route
    }

    func save(_ route: FolioleCompanionSyncGroupMemberRoute) throws {
        guard route.authorizationEpoch > 0, route.protocolVersion == 4,
              !route.routeId.isEmpty, !route.secret.isEmpty else { throw Self.invalid("route") }
        let data = try JSONEncoder().encode(route)
        let updated = SecItemUpdate(query(route.routeId) as CFDictionary,
                                    [kSecValueData as String: data] as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw Self.error(updated) }
        var request = query(route.routeId)
        request[kSecValueData as String] = data
        request[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(request as CFDictionary, nil)
        guard added == errSecSuccess else { throw Self.error(added) }
    }

    func revoke(_ routeId: String) throws -> Bool {
        let status = SecItemDelete(query(routeId) as CFDictionary)
        if status == errSecItemNotFound { return false }
        guard status == errSecSuccess else { throw Self.error(status) }
        return true
    }

    func sign(
        routeId: String, method: String, path: String, timestamp: String, nonce: String, bodyHash: String
    ) throws -> [String: String] {
        guard let route = try load(routeId) else { throw Self.invalid("sync_group_route_not_active") }
        let canonical = [contract.canonicalVersion, method.uppercased(), path, timestamp, nonce, bodyHash,
                         route.groupId, route.localMemberId, route.peerMemberId,
                         String(route.authorizationEpoch), route.routeId].joined(separator: "\n")
        let signature = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8), using: SymmetricKey(data: try Self.base64URL(route.secret)))
        return [
            try key("authorizationEpoch"): String(route.authorizationEpoch),
            try key("authorizationId"): route.authorizationId,
            try key("groupId"): route.groupId,
            try key("localMemberId"): route.localMemberId,
            try key("nonce"): nonce,
            try key("peerMemberId"): route.peerMemberId,
            try key("routeId"): route.routeId,
            try key("signature"): Data(signature).map { String(format: "%02x", $0) }.joined(),
            try key("timestamp"): timestamp
        ]
    }

    func state(_ route: FolioleCompanionSyncGroupMemberRoute) throws -> [String: Any] {
        let endpointHint = route.endpointHint.map { $0 as Any } ?? NSNull()
        return [try stateKey("authorizationEpoch"): route.authorizationEpoch,
         try stateKey("authorizationId"): route.authorizationId,
         try stateKey("endpointHint"): endpointHint,
         try stateKey("groupId"): route.groupId, try stateKey("kind"): "member",
         try stateKey("localMemberId"): route.localMemberId,
         try stateKey("peerMemberId"): route.peerMemberId,
         try stateKey("protocolVersion"): route.protocolVersion,
         try stateKey("routeId"): route.routeId, try stateKey("state"): "active"]
    }

    private func query(_ routeId: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrAccount as String: routeId, kSecAttrService as String: service]
    }

    private func key(_ name: String) throws -> String {
        guard let value = contract.headerKeys[name] else { throw Self.invalid(name) }
        return value
    }

    private func stateKey(_ name: String) throws -> String {
        guard let value = contract.stateKeys[name] else { throw Self.invalid(name) }
        return value
    }

    private static func base64URL(_ value: String) throws -> Data {
        var encoded = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        guard let data = Data(base64Encoded: encoded) else { throw invalid("route secret") }
        return data
    }

    private static func invalid(_ value: String) -> NSError {
        NSError(domain: "FolioleSyncGroupMemberRoute", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Invalid \(value)."])
    }

    private static func error(_ status: OSStatus) -> NSError {
        NSError(domain: "FolioleSyncGroupMemberRoute", code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: SecCopyErrorMessageString(status, nil) as String? ?? "Keychain error"])
    }
}
