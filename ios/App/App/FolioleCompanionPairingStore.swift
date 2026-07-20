import CryptoKit
import Foundation

final class FolioleCompanionPairingStore {
    private static let currentProtocolVersion = 1
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

    func loadState() throws -> [String: Any] {
        let deviceId = metadata("deviceId")
        let secret = try secrets.load()?.trimmedNonempty
        let hasCredentials = deviceId != nil && secret != nil
        let negotiatedVersion = defaults.integer(forKey: preference("negotiatedProtocolVersion"))
        let remoteProtocol = loadRemoteProtocol()
        let syncUsable = hasCredentials && negotiatedVersion == Self.currentProtocolVersion && remoteProtocol != nil
        return try state(
            deviceId: deviceId,
            hasCredentials: hasCredentials,
            negotiatedVersion: negotiatedVersion,
            remoteProtocol: remoteProtocol,
            syncUsable: syncUsable
        )
    }

    func save(
        deviceId: String,
        deviceKind: String,
        deviceName: String,
        deviceSecret: String,
        negotiatedProtocolVersion: Int,
        pairedAt: String,
        primaryDeviceId: String,
        remoteProtocol: [String: Any]
    ) throws -> [String: Any] {
        guard negotiatedProtocolVersion == Self.currentProtocolVersion, JSONSerialization.isValidJSONObject(remoteProtocol) else {
            throw Self.invalid("pairing protocol")
        }
        let required = [deviceId, deviceKind, deviceName, deviceSecret, pairedAt, primaryDeviceId]
        guard required.allSatisfy({ $0.trimmedNonempty != nil }) else { throw Self.invalid("pairing credentials") }
        let remoteProtocolData = try JSONSerialization.data(withJSONObject: remoteProtocol)
        try secrets.save(deviceSecret.trimmingCharacters(in: .whitespacesAndNewlines))
        defaults.set(deviceId.trimmedNonempty, forKey: preference("deviceId"))
        defaults.set(deviceKind.trimmedNonempty, forKey: preference("deviceKind"))
        defaults.set(deviceName.trimmedNonempty, forKey: preference("deviceName"))
        defaults.set(pairedAt.trimmedNonempty, forKey: preference("pairedAt"))
        defaults.set(primaryDeviceId.trimmedNonempty, forKey: preference("primaryDeviceId"))
        defaults.set(negotiatedProtocolVersion, forKey: preference("negotiatedProtocolVersion"))
        defaults.set(remoteProtocolData, forKey: preference("remoteProtocol"))
        return try loadState()
    }

    func savePrimaryDeviceId(_ value: String) throws -> [String: Any] {
        guard let value = value.trimmedNonempty else { throw Self.invalid("primary device id") }
        defaults.set(value, forKey: preference("primaryDeviceId"))
        return try loadState()
    }

    func sign(method: String, path: String, timestamp: String, nonce: String, bodyHash: String) throws -> [String: Any] {
        let state = try loadState()
        guard state[stateKey("syncUsable")] as? Bool == true,
              let deviceId = state[stateKey("deviceId")] as? String,
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
            signatureHeaderKey("deviceId"): deviceId,
            signatureHeaderKey("nonce"): nonce,
            signatureHeaderKey("signature"): signature,
            signatureHeaderKey("timestamp"): timestamp
        ]]
    }

    private func state(
        deviceId: String?,
        hasCredentials: Bool,
        negotiatedVersion: Int,
        remoteProtocol: [String: Any]?,
        syncUsable: Bool
    ) throws -> [String: Any] {
        [
            stateKey("deviceId"): deviceId ?? NSNull(),
            stateKey("deviceKind"): metadata("deviceKind") ?? NSNull(),
            stateKey("deviceName"): metadata("deviceName") ?? NSNull(),
            stateKey("isPaired"): hasCredentials,
            stateKey("negotiatedProtocolVersion"): negotiatedVersion > 0 ? negotiatedVersion : NSNull(),
            stateKey("pairedAt"): metadata("pairedAt") ?? NSNull(),
            stateKey("primaryDeviceId"): metadata("primaryDeviceId") ?? NSNull(),
            stateKey("remoteProtocol"): remoteProtocol ?? NSNull(),
            stateKey("repairRequired"): hasCredentials && !syncUsable,
            stateKey("syncUsable"): syncUsable
        ]
    }

    private func loadRemoteProtocol() -> [String: Any]? {
        guard let data = defaults.data(forKey: preference("remoteProtocol")) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private func metadata(_ name: String) -> String? { defaults.string(forKey: preference(name))?.trimmedNonempty }
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
