import CoreFoundation
import CryptoKit
import Foundation

final class FolioleCompanionSyncGroupJoinRequest {
    static let timeToLive: TimeInterval = 2 * 60
    private static let uuidV4 = "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"

    let deviceName: String
    let device: [String: Any]
    let expiresAt: Date
    let fingerprint: String
    let groupId: String
    let platform: String
    let publicKey: String
    let requestId: String
    let requestedAt: Date
    var acceptance: [String: Any]?

    init(value: [String: Any], now: Date) throws {
        var keys: Set<String> = ["contract_version", "device", "ephemeral_public_key", "group_id"]
        if value["merge_proof"] != nil { keys.insert("merge_proof") }
        try Self.exactKeys(value, keys)
        guard let version = value["contract_version"] as? NSNumber,
              CFGetTypeID(version) != CFBooleanGetTypeID(), version.intValue == 1,
              version.doubleValue == 1 else { throw Self.invalid("sync_group_join_contract_incompatible") }
        guard let device = value["device"] as? [String: Any] else {
            throw Self.invalid("sync_group_join_device_invalid")
        }
        try Self.exactKeys(device, [
            "canonical_library_path", "device_anchor", "device_name", "path_flavor", "platform"
        ])
        try Self.validateDevice(device)
        self.device = device
        groupId = try Self.required(value, "group_id")
        publicKey = try Self.validatePublicKey(Self.required(value, "ephemeral_public_key"))
        deviceName = try Self.required(device, "device_name")
        platform = try Self.required(device, "platform")
        fingerprint = try Self.fingerprint(value)
        requestId = UUID().uuidString.lowercased()
        requestedAt = now
        expiresAt = now.addingTimeInterval(Self.timeToLive)
    }

    var isPending: Bool { acceptance == nil }
    func isExpired(at now: Date) -> Bool { expiresAt <= now }

    func publicValue() -> [String: Any] {
        [
            "device_name": deviceName,
            "expires_at": Self.timestamp(expiresAt),
            "platform": platform,
            "request_id": requestId,
            "requested_at": Self.timestamp(requestedAt),
            "status": isPending ? "pending" : "accepted"
        ]
    }

    func registeredDevice(groupId: String) throws -> [String: Any] {
        let anchor = try Self.required(device, "device_anchor")
        let path = try Self.required(device, "canonical_library_path")
        let identityData = try JSONSerialization.data(withJSONObject: [1, groupId, anchor, path])
        guard let identity = String(data: identityData, encoding: .utf8) else {
            throw Self.invalid("sync_group_device_identity_invalid")
        }
        return device.merging(["device_identity_key": identity]) { _, new in new }
    }

    private static func fingerprint(_ value: [String: Any]) throws -> String {
        let device = try requiredObject(value, "device")
        var fields = [
            "foliole-sync-group-join-attempt-v1", "1", try required(value, "group_id"),
            try required(value, "ephemeral_public_key"),
            try required(device, "canonical_library_path"), try required(device, "device_anchor"),
            try required(device, "device_name"), try required(device, "path_flavor"),
            try required(device, "platform")
        ]
        if let proof = value["merge_proof"] as? [String: Any] {
            guard let revisions = proof["source_proof_revisions"] as? [String: Any] else {
                throw invalid("sync_group_join_merge_proof_invalid")
            }
            fields.append("proof")
            fields.append(try required(proof, "library_epoch"))
            fields.append(String(try nonnegativeInteger(proof["proof_revision"])))
            let keys = revisions.keys.sorted()
            fields.append(String(keys.count))
            for key in keys {
                guard !key.isEmpty, key == key.trimmingCharacters(in: .whitespacesAndNewlines) else {
                    throw invalid("sync_group_join_merge_proof_invalid")
                }
                fields.append(key)
                fields.append(String(try nonnegativeInteger(revisions[key])))
            }
        } else {
            guard value["merge_proof"] == nil else { throw invalid("sync_group_join_merge_proof_invalid") }
            fields.append("no-proof")
        }
        var canonical = Data()
        for field in fields {
            let bytes = Data(field.utf8)
            var length = UInt32(bytes.count).bigEndian
            canonical.append(Data(bytes: &length, count: MemoryLayout<UInt32>.size))
            canonical.append(bytes)
        }
        return SHA256.hash(data: canonical).map { String(format: "%02x", $0) }.joined()
    }

    private static func requiredObject(_ value: [String: Any], _ key: String) throws -> [String: Any] {
        guard let object = value[key] as? [String: Any] else { throw invalid("\(key)_invalid") }
        return object
    }

    private static func nonnegativeInteger(_ value: Any?) throws -> Int64 {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite, number.doubleValue == Double(number.int64Value),
              number.int64Value >= 0, number.doubleValue <= 9_007_199_254_740_991 else {
            throw invalid("sync_group_join_merge_proof_invalid")
        }
        return number.int64Value
    }

    private static func validateDevice(_ device: [String: Any]) throws {
        let flavor = try required(device, "path_flavor")
        guard flavor == "posix" || flavor == "windows" else {
            throw invalid("library_path_flavor_invalid")
        }
        let path = try required(device, "canonical_library_path")
        guard flavor == "posix" ? canonicalPosixPath(path) : canonicalWindowsPath(path) else {
            throw invalid("library_path_not_canonical")
        }
        guard try required(device, "device_anchor").range(of: uuidV4, options: .regularExpression) != nil else {
            throw invalid("device_anchor_invalid")
        }
        _ = try required(device, "device_name")
        _ = try required(device, "platform")
    }

    private static func validatePublicKey(_ value: String) throws -> String {
        let data = try Base64URL.decode(value)
        guard data.count == 65, data.first == 4 else {
            throw invalid("sync_group_join_public_key_invalid")
        }
        return value
    }

    private static func canonicalPosixPath(_ value: String) -> Bool {
        guard value.first == "/", value == "/" || value.last != "/" else { return false }
        return value == "/" || value.dropFirst().split(separator: "/", omittingEmptySubsequences: false)
            .allSatisfy { !$0.isEmpty && $0 != "." && $0 != ".." }
    }

    private static func canonicalWindowsPath(_ value: String) -> Bool {
        guard !value.contains("/"), !value.hasPrefix("\\\\?\\") else { return false }
        let characters = Array(value)
        if characters.count >= 3, characters[0].isLowercase,
           characters[1] == ":", characters[2] == "\\", value.lowercased() == value {
            return canonicalSegments(String(characters.dropFirst(3)), minimum: 0)
        }
        guard value.hasPrefix("\\\\") else { return false }
        return canonicalSegments(String(value.dropFirst(2)), minimum: 2)
    }

    private static func canonicalSegments(_ value: String, minimum: Int) -> Bool {
        if value.isEmpty { return minimum == 0 }
        let segments = value.split(separator: "\\", omittingEmptySubsequences: false)
        return segments.count >= minimum && segments.allSatisfy {
            !$0.isEmpty && $0 != "." && $0 != ".."
        }
    }

    static func required(_ value: [String: Any], _ key: String) throws -> String {
        guard let result = value[key] as? String, !result.isEmpty,
              result == result.trimmingCharacters(in: .whitespacesAndNewlines),
              !result.contains("\0") else { throw invalid("\(key)_invalid") }
        return result
    }

    static func exactKeys(_ value: [String: Any], _ expected: Set<String>) throws {
        guard Set(value.keys) == expected else { throw invalid("sync_group_join_payload_shape_invalid") }
    }

    static func timestamp(_ value: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: value)
    }

    static func invalid(_ detail: String) -> Error {
        NSError(domain: "FolioleCompanionSyncGroupJoin", code: 1,
                userInfo: [NSLocalizedDescriptionKey: detail])
    }
}
