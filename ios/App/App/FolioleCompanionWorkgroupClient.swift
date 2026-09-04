import CryptoKit
import Foundation

enum FolioleCompanionSyncGroupSecurity {
    static func groupTag(_ workgroupKey: String) throws -> String {
        let digest = SHA256.hash(data: try Base64URL.decode(workgroupKey))
        return digest.prefix(16).map { String(format: "%02x", $0) }.joined()
    }
}

struct FolioleCompanionSignedClientRequest {
    let body: Data?
    let endpoint: URL
    let groupId: String
    let groupTag: String
    let method: String
    let path: String
    let plaintextBody: Data?
    let workgroupKey: String

    func decrypt(_ data: Data, response: HTTPURLResponse) throws -> (Data, String) {
        guard response.value(forHTTPHeaderField: "Content-Type") == FolioleCompanionSyncGroupWorkgroup.envelopeContentType,
              let contentType = response.value(forHTTPHeaderField: "X-Foliole-Original-Content-Type"),
              !contentType.isEmpty else {
            throw FolioleCompanionSignedClientRequests.invalid("workgroup_aead_response_required")
        }
        return (try FolioleCompanionSyncGroupWorkgroup.decryptClientResponse(
            data, groupTag: groupTag, workgroupKey: workgroupKey,
            method: method, path: path, contentType: contentType
        ), contentType)
    }
}

enum FolioleCompanionSignedClientRequests {
    private static let lock = NSLock()
    private static var pending: [String: (Date, FolioleCompanionSignedClientRequest)] = [:]

    static func prepare(
        body: String?, bodyHash: String, endpointUrl: String, groupId: String,
        method: String, nonce: String, path: String, timestamp: String,
        deviceId: String, workgroupKey: String
    ) throws -> [String: Any] {
        guard let signedAt = requestDate(timestamp),
              abs(signedAt.timeIntervalSinceNow) <= 60 else { throw invalid("expired_timestamp") }
        guard let endpoint = URL(string: endpointUrl),
              ["http", "https"].contains(endpoint.scheme?.lowercased() ?? ""),
              endpoint.host != nil else { throw invalid("sync_group_endpoint_invalid") }
        let plaintext = body.map { Data($0.utf8) }
        guard SHA256.hash(data: plaintext ?? Data()).hex == bodyHash else {
            throw invalid("request_body_hash_mismatch")
        }
        let groupTag = try FolioleCompanionSyncGroupSecurity.groupTag(workgroupKey)
        let encrypted = try plaintext.map {
            try FolioleCompanionSyncGroupWorkgroup.encryptClientRequest(
                $0, groupTag: groupTag, workgroupKey: workgroupKey,
                method: method, path: path, contentType: "application/json; charset=utf-8"
            )
        }
        let canonical = [method, path, timestamp, nonce,
                         SHA256.hash(data: encrypted ?? Data()).hex].joined(separator: "\n")
        let signature = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8), using: SymmetricKey(data: Data(workgroupKey.utf8))
        ).map { String(format: "%02x", $0) }.joined()
        let request = FolioleCompanionSignedClientRequest(
            body: encrypted, endpoint: endpoint, groupId: groupId, groupTag: groupTag, method: method,
            path: path, plaintextBody: plaintext, workgroupKey: workgroupKey
        )
        lock.withLock {
            pending = pending.filter { $0.value.0.timeIntervalSinceNow > -60 }
            pending[nonce] = (Date(), request)
        }
        var headers = ["X-Device-Id": deviceId, "X-Nonce": nonce, "X-Signature": signature,
                       "X-Sync-Group-Id": groupId, "X-Timestamp": timestamp]
        if encrypted != nil { headers["Content-Type"] = FolioleCompanionSyncGroupWorkgroup.envelopeContentType }
        var result: [String: Any] = ["headers": headers]
        if let encrypted { result["body"] = String(decoding: encrypted, as: UTF8.self) }
        return result
    }

    static func claim(
        url: URL, method: String, headers: [String: String], body: Data?
    ) throws -> FolioleCompanionSignedClientRequest? {
        guard let groupId = header("x-sync-group-id", headers) else { return nil }
        guard let nonce = header("x-nonce", headers),
              let entry = lock.withLock({ pending.removeValue(forKey: nonce) }) else {
            throw invalid("workgroup_client_request_not_prepared")
        }
        let request = entry.1
        guard entry.0.timeIntervalSinceNow > -60,
              request.groupId == groupId, request.method == method.uppercased(),
              request.endpoint.scheme?.lowercased() == url.scheme?.lowercased(),
              request.endpoint.host?.lowercased() == url.host?.lowercased(),
              request.endpoint.port == url.port, request.path == path(url),
              body == request.plaintextBody || body == request.body else {
            throw invalid("workgroup_client_request_mismatch")
        }
        return request
    }

    static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSignedClientRequest", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }

    private static func header(_ name: String, _ headers: [String: String]) -> String? {
        headers.first { $0.key.lowercased() == name }?.value
    }

    private static func path(_ url: URL) -> String {
        url.path + (url.query.map { "?\($0)" } ?? "")
    }

    private static func requestDate(_ timestamp: String) -> Date? {
        let browserFormatter = ISO8601DateFormatter()
        browserFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return browserFormatter.date(from: timestamp) ?? ISO8601DateFormatter().date(from: timestamp)
    }
}

private extension Digest {
    var hex: String { map { String(format: "%02x", $0) }.joined() }
}
