import CryptoKit
import Foundation

protocol FolioleCompanionSyncGroupDataRequesting {
    func request(_ operation: String, _ payload: [String: Any]) throws -> [String: Any]
}

enum FolioleCompanionSyncGroupWorkgroup {
    static let envelopeContentType = "application/vnd.foliole.workgroup-aead+json"
    private static let version = "foliole-workgroup-aead-v1"
    private static let clockWindow: TimeInterval = 60

    static func authenticate(
        _ request: FolioleCompanionHttpMessage, groupId: String, workgroupKey: String,
        dataBridge: FolioleCompanionSyncGroupDataRequesting
    ) throws -> String {
        let deviceId = try header(request, "x-device-id")
        let nonce = try header(request, "x-nonce")
        let signature = try header(request, "x-signature")
        let timestamp = try header(request, "x-timestamp")
        guard try header(request, "x-sync-group-id") == groupId,
              let date = requestDate(timestamp),
              abs(date.timeIntervalSinceNow) <= clockWindow else { throw invalid("expired_or_missing_headers") }
        let digest = SHA256.hash(data: request.bodyData).hex
        let canonical = [request.method, request.path, timestamp, nonce, digest].joined(separator: "\n")
        let expected = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8), using: SymmetricKey(data: Data(workgroupKey.utf8))
        ).map { String(format: "%02x", $0) }.joined()
        guard constantTimeEqual(expected, signature) else { throw invalid("invalid_signature") }
        let verified = try dataBridge.request("verify_device", ["group_id": groupId, "device_id": deviceId])
        guard verified["active"] as? Bool == true else { throw invalid("sync_group_device_not_active") }
        try consumeNonce("\(groupId):\(deviceId):\(timestamp):\(nonce)")
        return deviceId
    }

    static func decryptRequest(
        _ request: FolioleCompanionHttpMessage, groupTag: String, workgroupKey: String
    ) throws -> Data {
        try decrypt(
            request.body, key: workgroupKey, groupTag: groupTag, method: request.method,
            path: request.path, direction: "request", contentType: "application/json; charset=utf-8"
        )
    }

    static func encryptClientRequest(
        _ body: Data, groupTag: String, workgroupKey: String,
        method: String, path: String, contentType: String
    ) throws -> Data {
        let envelope = try encrypt(
            body, key: workgroupKey, groupTag: groupTag, method: method,
            path: path, direction: "request", contentType: contentType
        )
        return try JSONSerialization.data(withJSONObject: envelope, options: [.sortedKeys])
    }

    static func decryptClientResponse(
        _ body: Data, groupTag: String, workgroupKey: String,
        method: String, path: String, contentType: String
    ) throws -> Data {
        guard let envelope = try JSONSerialization.jsonObject(with: body) as? [String: Any] else {
            throw invalid("workgroup_aead_envelope_invalid")
        }
        let plaintext = try decrypt(
            envelope, key: workgroupKey, groupTag: groupTag, method: method,
            path: path, direction: "response", contentType: contentType
        )
        guard let timestamp = envelope["timestamp_ms"], let nonce = envelope["nonce"] as? String else {
            throw invalid("workgroup_aead_envelope_invalid")
        }
        try consumeNonce("response:\(groupTag):\(timestamp):\(nonce)")
        return plaintext
    }

    static func response(
        _ request: FolioleCompanionHttpMessage, status: Int, contentType: String,
        body: Data, groupTag: String, workgroupKey: String
    ) throws -> Data {
        let envelope = try encrypt(
            body, key: workgroupKey, groupTag: groupTag, method: request.method,
            path: request.path, direction: "response", contentType: contentType
        )
        let encoded = try JSONSerialization.data(withJSONObject: envelope, options: [.sortedKeys])
        return FolioleCompanionHttpMessage.response(
            status: status, contentType: envelopeContentType, body: encoded, originalContentType: contentType
        )
    }

    private static func encrypt(
        _ body: Data, key: String, groupTag: String, method: String, path: String,
        direction: String, contentType: String
    ) throws -> [String: Any] {
        let timestamp = Int64(Date().timeIntervalSince1970 * 1000)
        let nonce = AES.GCM.Nonce()
        let sealed = try AES.GCM.seal(body, using: derivedKey(key, groupTag, direction), nonce: nonce,
            authenticating: aad(groupTag, method, path, direction, contentType, timestamp))
        return ["ciphertext": Base64URL.encode(sealed.ciphertext + sealed.tag), "content_type": contentType,
            "nonce": Base64URL.encode(Data(nonce)), "timestamp_ms": timestamp, "version": version]
    }

    private static func decrypt(
        _ envelope: [String: Any], key: String, groupTag: String, method: String,
        path: String, direction: String, contentType: String
    ) throws -> Data {
        guard envelope["version"] as? String == version, envelope["content_type"] as? String == contentType,
              let timestamp = envelope["timestamp_ms"] as? Int64,
              abs(Date().timeIntervalSince1970 * 1000 - Double(timestamp)) <= clockWindow * 1000,
              let nonceValue = envelope["nonce"] as? String,
              let ciphertextValue = envelope["ciphertext"] as? String else { throw invalid("workgroup_aead_envelope_invalid") }
        let nonceData = try Base64URL.decode(nonceValue), ciphertext = try Base64URL.decode(ciphertextValue)
        guard nonceData.count == 12, ciphertext.count >= 16 else { throw invalid("workgroup_aead_envelope_invalid") }
        let box = try AES.GCM.SealedBox(
            nonce: AES.GCM.Nonce(data: nonceData), ciphertext: ciphertext.dropLast(16), tag: ciphertext.suffix(16)
        )
        return try AES.GCM.open(box, using: derivedKey(key, groupTag, direction),
            authenticating: aad(groupTag, method, path, direction, contentType, timestamp))
    }

    private static func derivedKey(_ encoded: String, _ groupTag: String, _ direction: String) throws -> SymmetricKey {
        HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: try Base64URL.decode(encoded)),
            salt: Data(groupTag.utf8), info: Data("Foliole Workgroup AEAD v1\n\(direction)".utf8), outputByteCount: 32)
    }

    private static func aad(
        _ tag: String, _ method: String, _ path: String, _ direction: String,
        _ contentType: String, _ timestamp: Int64
    ) -> Data {
        Data([version, tag, method.uppercased(), path, direction, contentType, String(timestamp)].joined(separator: "\n").utf8)
    }

    private static func header(_ request: FolioleCompanionHttpMessage, _ name: String) throws -> String {
        guard let value = request.header(name), !value.isEmpty else { throw invalid("missing_headers") }
        return value
    }

    private static func requestDate(_ timestamp: String) -> Date? {
        let browserFormatter = ISO8601DateFormatter()
        browserFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return browserFormatter.date(from: timestamp) ?? ISO8601DateFormatter().date(from: timestamp)
    }

    private static func consumeNonce(_ identity: String) throws {
        let store = UserDefaults.standard, prefix = "foliole.sync.request.nonce."
        let key = prefix + identity, now = Date().timeIntervalSince1970
        guard store.object(forKey: key) == nil else { throw invalid("replayed_nonce") }
        for existing in store.dictionaryRepresentation().keys where existing.hasPrefix(prefix) {
            if store.double(forKey: existing) < now { store.removeObject(forKey: existing) }
        }
        store.set(now + clockWindow, forKey: key)
    }

    private static func constantTimeEqual(_ left: String, _ right: String) -> Bool {
        let a = Array(left.utf8), b = Array(right.utf8)
        guard a.count == b.count else { return false }
        return zip(a, b).reduce(UInt8(0)) { $0 | ($1.0 ^ $1.1) } == 0
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncGroupWorkgroup", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}

private extension Digest {
    var hex: String { map { String(format: "%02x", $0) }.joined() }
}
