import Foundation
import FolioleFramedSyncRuntime

struct FolioleFramedSyncHTTPPeer {
    let groupID: String
    let deviceID: String
    let libraryEpoch: String
    let memberAuthHeaders: [String: String]
}

enum FolioleFramedSyncHTTPTransport {
    static let contentType = "application/vnd.foliole.framed-sync"

    static func post(
        endpoint: URL,
        peer: FolioleFramedSyncHTTPPeer,
        requestBodyURL: URL,
        responseBodyURL: URL,
        configuration: URLSessionConfiguration = makeConfiguration()
    ) async throws -> URL {
        let request = try makeRequest(endpoint: endpoint, peer: peer)
        guard FileManager.default.fileExists(atPath: requestBodyURL.path) else {
            throw FolioleFramedSyncValidationError("framed_sync_request_body_missing")
        }
        guard !FileManager.default.fileExists(atPath: responseBodyURL.path) else {
            throw FolioleFramedSyncValidationError("framed_sync_response_path_exists")
        }
        let receiver = FolioleFramedSyncHTTPReceiver(
            responseURL: responseBodyURL,
            expectedDeviceID: peer.deviceID,
            expectedLibraryEpoch: peer.libraryEpoch
        )
        return try await receiver.upload(
            request: request,
            bodyURL: requestBodyURL,
            configuration: configuration
        )
    }

    static func makeRequest(endpoint: URL, peer: FolioleFramedSyncHTTPPeer) throws -> URLRequest {
        guard ["http", "https"].contains(endpoint.scheme?.lowercased() ?? "") else {
            throw FolioleFramedSyncValidationError("framed_sync_endpoint_invalid")
        }
        try requireText(peer.groupID, code: "sync_group_id_required")
        try requireText(peer.deviceID, code: "remote_device_id_required")
        try requireText(peer.libraryEpoch, code: "remote_library_epoch_required")
        try requireMemberAuth(peer.memberAuthHeaders, groupID: peer.groupID)
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue(contentType, forHTTPHeaderField: "Accept")
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        peer.memberAuthHeaders.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        request.setValue(peer.groupID, forHTTPHeaderField: "X-Sync-Group-Id")
        return request
    }

    static func validateResponse(
        _ response: HTTPURLResponse,
        expectedDeviceID: String,
        expectedLibraryEpoch: String
    ) throws {
        guard response.statusCode == 200 else {
            throw FolioleFramedSyncValidationError("framed_sync_http_\(response.statusCode)")
        }
        let mediaType = response.value(forHTTPHeaderField: "Content-Type")?
            .split(separator: ";", maxSplits: 1).first?
            .trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard mediaType == contentType else {
            throw FolioleFramedSyncValidationError("framed_sync_response_content_type_invalid")
        }
        guard response.value(forHTTPHeaderField: "X-Foliole-Device-Id") == expectedDeviceID,
              response.value(forHTTPHeaderField: "X-Foliole-Library-Epoch") == expectedLibraryEpoch else {
            throw FolioleFramedSyncValidationError("framed_sync_response_identity_mismatch")
        }
    }

    static func httpErrorCode(statusCode: Int, body: Data) -> String {
        let fallback = "framed_sync_http_\(statusCode)"
        guard body.count <= 4 * 1024,
              let object = try? JSONSerialization.jsonObject(with: body) as? [String: String],
              let detail = object["error"] else { return fallback }
        if detail == "framed_sync_source_changed" { return "\(fallback):\(detail)" }
        let prefix = "framed_sync_node_parent_missing:"
        let parentID = String(detail.dropFirst(prefix.count))
        guard detail.hasPrefix(prefix), !parentID.isEmpty,
              parentID.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil else {
            return fallback
        }
        return "\(fallback):\(detail)"
    }

    private static func makeConfiguration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        configuration.urlCredentialStorage = nil
        configuration.timeoutIntervalForRequest = 60
        configuration.timeoutIntervalForResource = 300
        configuration.waitsForConnectivity = true
        return configuration
    }

    private static func requireMemberAuth(_ headers: [String: String], groupID: String) throws {
        for name in ["x-device-id", "x-nonce", "x-signature", "x-timestamp"] {
            guard header(name, in: headers) != nil else {
                throw FolioleFramedSyncValidationError("member_auth_headers_required")
            }
        }
        if let signedGroup = header("x-sync-group-id", in: headers), signedGroup != groupID {
            throw FolioleFramedSyncValidationError("sync_group_identity_mismatch")
        }
    }

    private static func header(_ name: String, in headers: [String: String]) -> String? {
        headers.first { $0.key.lowercased() == name }?.value
            .trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }

    private static func requireText(_ value: String, code: String) throws {
        guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw FolioleFramedSyncValidationError(code)
        }
    }
}

enum FolioleFramedSyncSessionWriter {
    static func encode(
        groupKey: Data, context: FolioleFramedSyncSessionContext,
        messages: [FolioleFramedSyncValidatedMessage],
        nonceDirectory: URL = defaultNonceDirectory()
    ) throws -> Data {
        guard messages.count <= FolioleFramedSyncLimits.maxSessionFrames else {
            throw FolioleFramedSyncValidationError("session_frame_limit_invalid")
        }
        let sessionID = withUnsafeBytes(of: UUID().uuid) { Data($0) }
        var random = UInt32.random(in: .min ... .max).bigEndian
        let noncePrefix = withUnsafeBytes(of: &random) { Data($0) }
        let contextID = context.deriveContextID(sessionID: sessionID)
        let preamble = try makePreamble(
            contextID: contextID, sessionID: sessionID, noncePrefix: noncePrefix
        )
        try persistNonceState(
            sessionID: sessionID, contextID: contextID,
            noncePrefix: noncePrefix, directory: nonceDirectory
        )
        let output = OutputStream.toMemory()
        let writer = FolioleFramedSyncStreamWriter(output: output)
        try writer.write(preamble: preamble.encoded)
        var sessionBytes = FolioleFramedSyncPreamble.byteCount
        for (index, message) in messages.enumerated() {
            guard message.payload.isSessionControl else {
                throw FolioleFramedSyncValidationError("session_control_payload_required")
            }
            let plaintext = try FolioleFramedSyncCodec.encode(message)
            sessionBytes += plaintext.count + 32
            guard sessionBytes <= FolioleFramedSyncLimits.maxSessionBytes else {
                throw FolioleFramedSyncValidationError("session_byte_limit_exceeded")
            }
            let header = try FolioleFramedSyncWireHeader(
                ciphertextBytes: plaintext.count + 16,
                sequence: UInt64(index), frameType: .sessionControl
            ).encode()
            let ciphertext = try FolioleFramedSyncFrameCrypto.encrypt(
                groupKey: groupKey, preamble: preamble, header: header,
                plaintext: plaintext, sequence: UInt64(index)
            )
            try writer.write(header: header, ciphertext: ciphertext)
        }
        guard let data = output.property(forKey: .dataWrittenToMemoryStreamKey) as? Data else {
            throw FolioleFramedSyncValidationError("framed_sync_stream_write_failed")
        }
        return data
    }

    private static func makePreamble(
        contextID: Data, sessionID: Data, noncePrefix: Data
    ) throws -> FolioleFramedSyncPreamble {
        var bytes = Data(repeating: 0, count: FolioleFramedSyncPreamble.byteCount)
        bytes.replaceSubrange(0..<8, with: Data("FOLSYNC2".utf8))
        bytes[8] = 0; bytes[9] = UInt8(FolioleFramedSyncPreamble.byteCount)
        bytes[10] = 0; bytes[11] = 22; bytes[12] = 1
        bytes.replaceSubrange(16..<48, with: contextID)
        bytes.replaceSubrange(48..<64, with: sessionID)
        bytes.replaceSubrange(64..<68, with: noncePrefix)
        return try FolioleFramedSyncPreamble(decoding: bytes)
    }

    private static func persistNonceState(
        sessionID: Data, contextID: Data, noncePrefix: Data, directory: URL
    ) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appendingPathComponent(sessionID.hex)
        let value = contextID + noncePrefix + Data(repeating: 0, count: 8)
        if FileManager.default.fileExists(atPath: file.path) {
            guard try Data(contentsOf: file) == value else {
                throw FolioleFramedSyncValidationError("session_nonce_reuse_detected")
            }
            return
        }
        guard FileManager.default.createFile(atPath: file.path, contents: value) else {
            throw FolioleFramedSyncValidationError("session_nonce_state_write_failed")
        }
    }

    private static func defaultNonceDirectory() -> URL {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return root.appendingPathComponent("Foliole/framed-sync/session-nonces", isDirectory: true)
    }
}

private extension FolioleFramedSyncPayload {
    var isSessionControl: Bool {
        switch self {
        case .transferHeader, .fact, .blobChunk, .transferTrailer, .transferReceipt: false
        default: true
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
