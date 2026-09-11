import CryptoKit
import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleCompanionWorkgroupClientTests: XCTestCase {
    private let key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    private let path = "/companion/sync-pack?after_state_seq=0"

    func testEncryptsSignsAndClaimsOneExactRequest() throws {
        let body = "{\"group_id\":\"group-a\"}"
        let nonce = UUID().uuidString.lowercased()
        let prepared = try prepare(body: body, nonce: nonce, method: "POST", path: "/companion/sync-push")
        let headers = try XCTUnwrap(prepared["headers"] as? [String: String])
        let encrypted = try XCTUnwrap(prepared["body"] as? String)

        XCTAssertNotEqual(encrypted, body)
        XCTAssertEqual(headers["Content-Type"], FolioleCompanionSyncGroupWorkgroup.envelopeContentType)
        XCTAssertFalse(try XCTUnwrap(headers["X-Signature"]).isEmpty)
        let request = try XCTUnwrap(FolioleCompanionSignedClientRequests.claim(
            url: try XCTUnwrap(URL(string: "http://desktop.local/companion/sync-push")),
            method: "POST", headers: headers, body: Data(body.utf8)
        ))
        XCTAssertEqual(request.body, Data(encrypted.utf8))
        XCTAssertThrowsError(try FolioleCompanionSignedClientRequests.claim(
            url: try XCTUnwrap(URL(string: "http://desktop.local/companion/sync-push")),
            method: "POST", headers: headers, body: Data(body.utf8)
        ))
    }

    func testAuthenticatesDecryptsAndRejectsResponseReplay() throws {
        let request = try claimedRequest()
        let envelope = try responseEnvelope(
            body: Data("{\"ok\":true}".utf8), contentType: "application/json; charset=utf-8"
        )
        let response = try httpResponse(originalContentType: "application/json; charset=utf-8")

        XCTAssertEqual(try request.decrypt(envelope, response: response).0, Data("{\"ok\":true}".utf8))
        XCTAssertThrowsError(try request.decrypt(envelope, response: response))
    }

    func testRejectsTamperingIdentityExpiryAndMissingEnvelopeHeaders() throws {
        let request = try claimedRequest()
        var tampered = try XCTUnwrap(
            JSONSerialization.jsonObject(with: responseEnvelope(body: Data("payload".utf8))) as? [String: Any]
        )
        tampered["ciphertext"] = "AAAA"
        XCTAssertThrowsError(try request.decrypt(
            try JSONSerialization.data(withJSONObject: tampered),
            response: try httpResponse(originalContentType: "application/octet-stream")
        ))

        var expired = try XCTUnwrap(
            JSONSerialization.jsonObject(with: responseEnvelope(body: Data("payload".utf8))) as? [String: Any]
        )
        expired["timestamp_ms"] = 0
        XCTAssertThrowsError(try request.decrypt(
            try JSONSerialization.data(withJSONObject: expired),
            response: try httpResponse(originalContentType: "application/octet-stream")
        ))
        XCTAssertThrowsError(try request.decrypt(
            try responseEnvelope(body: Data("payload".utf8), method: "POST"),
            response: try httpResponse(originalContentType: "application/octet-stream")
        ))
        XCTAssertThrowsError(try request.decrypt(
            try responseEnvelope(body: Data("payload".utf8)),
            response: try httpResponse(originalContentType: nil)
        ))
    }

    func testRejectsAnExpiredOrMismatchedRequestBeforeNetworkUse() throws {
        XCTAssertThrowsError(try FolioleCompanionSignedClientRequests.prepare(
            body: nil, bodyHash: sha256(Data()), endpointUrl: "http://desktop.local",
            groupId: "group-a", method: "GET", nonce: UUID().uuidString.lowercased(), path: path,
            timestamp: "2020-01-01T00:00:00.000Z", deviceId: "device-a", workgroupKey: key
        ))
        let nonce = UUID().uuidString.lowercased()
        let headers = try XCTUnwrap(try prepare(body: nil, nonce: nonce)["headers"] as? [String: String])
        XCTAssertThrowsError(try FolioleCompanionSignedClientRequests.claim(
            url: try XCTUnwrap(URL(string: "http://other.local\(path)")),
            method: "GET", headers: headers, body: nil
        ))
    }

    func testAcceptsBrowserIsoTimestampWithFractionalSeconds() throws {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let prepared = try FolioleCompanionSignedClientRequests.prepare(
            body: nil, bodyHash: sha256(Data()), endpointUrl: "http://desktop.local",
            groupId: "group-a", method: "GET", nonce: UUID().uuidString.lowercased(), path: path,
            timestamp: formatter.string(from: Date()), deviceId: "device-a", workgroupKey: key
        )

        XCTAssertNotNil(prepared["headers"])
    }

    private func claimedRequest() throws -> FolioleCompanionSignedClientRequest {
        let headers = try XCTUnwrap(
            try prepare(body: nil, nonce: UUID().uuidString.lowercased())["headers"] as? [String: String]
        )
        return try XCTUnwrap(FolioleCompanionSignedClientRequests.claim(
            url: try XCTUnwrap(URL(string: "http://desktop.local\(path)")),
            method: "GET", headers: headers, body: nil
        ))
    }

    private func prepare(body: String?, nonce: String, method: String = "GET", path: String? = nil) throws -> [String: Any] {
        try FolioleCompanionSignedClientRequests.prepare(
            body: body, bodyHash: sha256(body.map { Data($0.utf8) } ?? Data()),
            endpointUrl: "http://desktop.local", groupId: "group-a", method: method,
            nonce: nonce, path: path ?? self.path, timestamp: ISO8601DateFormatter().string(from: Date()),
            deviceId: "device-a", workgroupKey: key
        )
    }

    private func responseEnvelope(
        body: Data,
        contentType: String = "application/octet-stream",
        method: String = "GET"
    ) throws -> Data {
        let request = FolioleCompanionHttpMessage(
            body: [:], bodyData: Data(), headers: [:], method: method, path: path
        )
        let raw = try FolioleCompanionSyncGroupWorkgroup.response(
            request, status: 200, contentType: contentType, body: body,
            groupTag: FolioleCompanionSyncGroupSecurity.groupTag(key), workgroupKey: key
        )
        let separator = try XCTUnwrap(raw.range(of: Data("\r\n\r\n".utf8)))
        return Data(raw[separator.upperBound...])
    }

    private func httpResponse(originalContentType: String?) throws -> HTTPURLResponse {
        var fields = ["Content-Type": FolioleCompanionSyncGroupWorkgroup.envelopeContentType]
        if let originalContentType { fields["X-Foliole-Original-Content-Type"] = originalContentType }
        return try XCTUnwrap(HTTPURLResponse(
            url: try XCTUnwrap(URL(string: "http://desktop.local\(path)")),
            statusCode: 200, httpVersion: nil, headerFields: fields
        ))
    }

    private func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
