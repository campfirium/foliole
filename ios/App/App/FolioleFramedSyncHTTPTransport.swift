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
        configuration: URLSessionConfiguration = makeConfiguration(),
        owner: FolioleFramedSyncPayloadBudget? = nil, responseLane: FolioleFramedSyncPayloadBudget.Lane = .payload,
        requestLoan: FolioleFramedSyncPayloadBudget.Loan? = nil, receiptSequence: Bool = false
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
            expectedLibraryEpoch: peer.libraryEpoch, owner: owner, responseLane: responseLane, receiptSequence: receiptSequence
        )
        let networkLoan = try await FolioleFramedSyncPayloadWorker.run {
            try owner.flatMap { requestLoan == nil ? try FolioleFramedSyncPayloadWorker.borrow($0, direction: .outbound) : nil }
        }
        defer { networkLoan?.release() }
        return try await receiver.upload(
            request: request,
            bodyURL: requestBodyURL,
            configuration: configuration, outgoingLoan: networkLoan
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
        if detail == "framed_sync_source_changed" || detail == "framed_sync_resource_source_unavailable" { return "\(fallback):\(detail)" }
        let prefixes = ["framed_sync_node_parent_missing:", "node_position_lineage_unproven:",
                        "parent_order_position_lineage_unproven:", "sync_parent_order_body_unavailable:",
            "framed_sync_review_node_missing:", "framed_sync_parent_relation_version_missing:"]
        guard let prefix = prefixes.first(where: detail.hasPrefix) else { return fallback }
        let parentID = String(detail.dropFirst(prefix.count))
        guard !parentID.isEmpty,
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

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
