import CryptoKit
import Foundation

final class FolioleCompanionPairingStore {
    private static let currentProtocolVersion = 1
    private static let legacyPrimaryDeviceKey = "primary_device_id"
    private let contract: FolioleCompanionPairingContract
    private let defaults: UserDefaults
    private let secrets: FolioleCompanionPairingSecretStore

    init(
        contract: FolioleCompanionPairingContract,
        defaults: UserDefaults? = nil,
        secrets: FolioleCompanionPairingSecretStore? = nil
    ) throws {
        guard let suite = contract.storageKeys["preferencesName"] else { throw Self.invalid("storage.preferencesName") }
        guard let resolvedDefaults = defaults ?? UserDefaults(suiteName: suite) else { throw Self.invalid("user defaults") }
        guard let service = contract.storageKeys["keyAlias"] else { throw Self.invalid("storage.keyAlias") }
        self.contract = contract
        self.defaults = resolvedDefaults
        self.secrets = secrets ?? FolioleCompanionKeychainSecretStore(service: service)
    }

    func clear() throws -> [String: Any] {
        try secrets.delete()
        for key in contract.preferenceKeys.values { defaults.removeObject(forKey: key) }
        return try loadState()
    }

    var storedDeviceId: String? { metadata("deviceId") }

    func loadState() throws -> [String: Any] {
        defaults.removeObject(forKey: Self.legacyPrimaryDeviceKey)
        try ensureAuthorizationCutover()
        let authorizationId = metadata("authorizationId")
        let deviceId = metadata("deviceId")
        let secret = try secrets.load()?.trimmedNonempty
        let hasCredentials = authorizationId != nil && secret != nil
        let negotiatedVersion = defaults.integer(forKey: preference("negotiatedProtocolVersion"))
        let remoteProtocol = loadRemoteProtocol()
        let syncUsable = hasCredentials && negotiatedVersion == Self.currentProtocolVersion && remoteProtocol != nil
        return try state(
            authorizationId: authorizationId,
            deviceId: deviceId,
            hasCredentials: hasCredentials,
            negotiatedVersion: negotiatedVersion,
            remoteProtocol: remoteProtocol,
            syncUsable: syncUsable
        )
    }

    func save(
        authorizationId: String,
        credentialSecret: String,
        deviceId: String,
        deviceKind: String,
        deviceName: String,
        hostName: String,
        hostPlatform: String,
        negotiatedProtocolVersion: Int,
        pairedAt: String,
        remotePeerId: String?,
        remotePeerName: String?,
        remotePeerPlatform: String?,
        remoteProtocol: [String: Any]
    ) throws -> [String: Any] {
        guard negotiatedProtocolVersion == Self.currentProtocolVersion, JSONSerialization.isValidJSONObject(remoteProtocol) else {
            throw Self.invalid("pairing protocol")
        }
        let required = [authorizationId, credentialSecret, deviceId, deviceKind, deviceName,
                        hostName, hostPlatform, pairedAt]
        guard required.allSatisfy({ $0.trimmedNonempty != nil }) else { throw Self.invalid("pairing credentials") }
        let remoteProtocolData = try JSONSerialization.data(withJSONObject: remoteProtocol)
        try secrets.save(credentialSecret.trimmingCharacters(in: .whitespacesAndNewlines))
        defaults.set(authorizationId.trimmedNonempty, forKey: preference("authorizationId"))
        defaults.set(deviceId.trimmedNonempty, forKey: preference("deviceId"))
        defaults.set(deviceKind.trimmedNonempty, forKey: preference("deviceKind"))
        defaults.set(deviceName.trimmedNonempty, forKey: preference("deviceName"))
        defaults.set(hostName.trimmedNonempty, forKey: preference("hostName"))
        defaults.set(hostPlatform.trimmedNonempty, forKey: preference("hostPlatform"))
        defaults.set(pairedAt.trimmedNonempty, forKey: preference("pairedAt"))
        setOptional(remotePeerId, forKey: preference("remotePeerId"))
        setOptional(remotePeerName, forKey: preference("remotePeerName"))
        setOptional(remotePeerPlatform, forKey: preference("remotePeerPlatform"))
        defaults.set(negotiatedProtocolVersion, forKey: preference("negotiatedProtocolVersion"))
        defaults.set(remoteProtocolData, forKey: preference("remoteProtocol"))
        return try loadState()
    }

    func sign(method: String, path: String, timestamp: String, nonce: String, bodyHash: String) throws -> [String: Any] {
        let state = try loadState()
        guard state[stateKey("syncUsable")] as? Bool == true,
              let authorizationId = state[stateKey("authorizationId")] as? String,
              let secret = try secrets.load()?.trimmedNonempty else {
            throw Self.invalid("pairing must be repaired")
        }
        let values = [method, path, timestamp, nonce, bodyHash]
        guard values.allSatisfy({ $0.trimmedNonempty != nil }) else { throw Self.invalid("signature request") }
        let canonical = [method.uppercased(), path, timestamp, nonce, bodyHash].joined(separator: "\n")
        let signature = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8),
            using: SymmetricKey(data: Data(secret.utf8))
        ).map { String(format: "%02x", $0) }.joined()
        return [signatureResponseKey("headers"): [
            signatureHeaderKey("authorizationId"): authorizationId,
            signatureHeaderKey("nonce"): nonce,
            signatureHeaderKey("signature"): signature,
            signatureHeaderKey("timestamp"): timestamp
        ]]
    }

    private func state(
        authorizationId: String?,
        deviceId: String?,
        hasCredentials: Bool,
        negotiatedVersion: Int,
        remoteProtocol: [String: Any]?,
        syncUsable: Bool
    ) throws -> [String: Any] {
        [
            stateKey("authorizationId"): authorizationId ?? NSNull(),
            stateKey("deviceId"): deviceId ?? NSNull(),
            stateKey("deviceKind"): metadata("deviceKind") ?? NSNull(),
            stateKey("deviceName"): metadata("deviceName") ?? NSNull(),
            stateKey("hostName"): metadata("hostName") ?? NSNull(),
            stateKey("hostPlatform"): metadata("hostPlatform") ?? NSNull(),
            stateKey("isPaired"): hasCredentials,
            stateKey("negotiatedProtocolVersion"): negotiatedVersion > 0 ? negotiatedVersion : NSNull(),
            stateKey("pairedAt"): metadata("pairedAt") ?? NSNull(),
            stateKey("remotePeerId"): metadata("remotePeerId") ?? NSNull(),
            stateKey("remotePeerName"): metadata("remotePeerName") ?? NSNull(),
            stateKey("remotePeerPlatform"): metadata("remotePeerPlatform") ?? NSNull(),
            stateKey("remoteProtocol"): remoteProtocol ?? NSNull(),
            stateKey("repairRequired"): hasCredentials && !syncUsable,
            stateKey("syncUsable"): syncUsable
        ]
    }

    private func ensureAuthorizationCutover() throws {
        guard metadata("authorizationId") == nil,
              let deviceId = metadata("deviceId"),
              try secrets.load()?.trimmedNonempty != nil else { return }
        defaults.set(deviceId, forKey: preference("authorizationId"))
        defaults.set(metadata("deviceName") ?? deviceId, forKey: preference("hostName"))
        defaults.set(metadata("deviceKind") ?? "ios-capacitor", forKey: preference("hostPlatform"))
    }

    private func loadRemoteProtocol() -> [String: Any]? {
        guard let data = defaults.data(forKey: preference("remoteProtocol")) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private func metadata(_ name: String) -> String? { defaults.string(forKey: preference(name))?.trimmedNonempty }
    private func setOptional(_ value: String?, forKey key: String) {
        if let value = value?.trimmedNonempty {
            defaults.set(value, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }
    private func preference(_ name: String) -> String { contract.preferenceKeys[name] ?? "invalid.\(name)" }
    private func signatureHeaderKey(_ name: String) -> String { contract.signatureHeaderKeys[name] ?? "invalid.\(name)" }
    private func signatureResponseKey(_ name: String) -> String { contract.signatureResponseKeys[name] ?? "invalid.\(name)" }
    private func stateKey(_ name: String) -> String { contract.stateKeys[name] ?? "invalid.\(name)" }

    private static func invalid(_ detail: String) -> NSError {
        NSError(domain: "FolioleCompanionPairing", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid companion \(detail)."])
    }
}

private extension String {
    var trimmedNonempty: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
