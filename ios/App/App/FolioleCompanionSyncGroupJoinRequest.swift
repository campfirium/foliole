import CoreFoundation
import Foundation

final class FolioleCompanionSyncGroupJoinRequest {
    static let timeToLive: TimeInterval = 2 * 60
    private static let uuidV4 = "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"

    let deviceName: String
    let device: [String: Any]
    let expiresAt: Date
    let groupId: String
    let platform: String
    let publicKey: String
    let requestId: String
    let requestedAt: Date
    var acceptance: [String: Any]?

    init(value: [String: Any], now: Date) throws {
        try Self.exactKeys(value, ["contract_version", "device", "ephemeral_public_key", "group_id"])
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

    private static func validateDevice(_ device: [String: Any]) throws {
        guard try required(device, "path_flavor") == "posix" else {
            throw invalid("library_path_flavor_invalid")
        }
        guard canonicalPosixPath(try required(device, "canonical_library_path")) else {
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
