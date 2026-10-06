import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncHTTPTransportTests: XCTestCase {
    override func tearDown() {
        FramedSyncURLProtocol.handler = nil
        super.tearDown()
    }

    func testPostStreamsFileBackedBinaryRequestAndResponse() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-framed-http-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let requestURL = directory.appendingPathComponent("request.bin")
        let responseURL = directory.appendingPathComponent("response.bin")
        let requestBytes = Data([0, 255, 1, 254])
        let responseBytes = Data([9, 0, 255, 8])
        try requestBytes.write(to: requestURL)
        FramedSyncURLProtocol.handler = { request in
            XCTAssertEqual(try Self.readBody(request), requestBytes)
            let response = try XCTUnwrap(HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: [
                    "Content-Type": FolioleFramedSyncHTTPTransport.contentType,
                    "X-Foliole-Device-Id": "desktop-b",
                    "X-Foliole-Library-Epoch": "epoch-b"
                ]
            ))
            return (response, responseBytes)
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FramedSyncURLProtocol.self]

        let received = try await FolioleFramedSyncHTTPTransport.post(
            endpoint: URL(string: "http://127.0.0.1/companion/framed-sync")!,
            peer: peer(),
            requestBodyURL: requestURL,
            responseBodyURL: responseURL,
            configuration: configuration
        )

        XCTAssertEqual(received, responseURL)
        XCTAssertEqual(try Data(contentsOf: received), responseBytes)
    }

    func testRequestKeepsBinaryMediaTypeAndExistingMemberAuthentication() throws {
        let request = try FolioleFramedSyncHTTPTransport.makeRequest(
            endpoint: URL(string: "http://127.0.0.1:8848/companion/framed-sync")!,
            peer: peer()
        )
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), FolioleFramedSyncHTTPTransport.contentType)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), FolioleFramedSyncHTTPTransport.contentType)
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Sync-Group-Id"), "group-a")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Signature"), "signature")
    }

    func testRequestRejectsMissingAuthenticationBeforeNetworkAccess() throws {
        let value = FolioleFramedSyncHTTPPeer(
            groupID: "group-a",
            deviceID: "desktop-b",
            libraryEpoch: "epoch-b",
            memberAuthHeaders: [:]
        )
        XCTAssertThrowsError(try FolioleFramedSyncHTTPTransport.makeRequest(
            endpoint: URL(string: "http://127.0.0.1:1/companion/framed-sync")!,
            peer: value
        )) { error in
            XCTAssertEqual(
                error as? FolioleFramedSyncValidationError,
                FolioleFramedSyncValidationError("member_auth_headers_required")
            )
        }
    }

    func testResponseMustMatchExpectedPeerIdentityAndBinaryMediaType() throws {
        let url = URL(string: "http://127.0.0.1/companion/framed-sync")!
        let valid = try XCTUnwrap(HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: nil,
            headerFields: [
                "Content-Type": "application/vnd.foliole.framed-sync; version=22",
                "X-Foliole-Device-Id": "desktop-b",
                "X-Foliole-Library-Epoch": "epoch-b"
            ]
        ))
        XCTAssertNoThrow(try FolioleFramedSyncHTTPTransport.validateResponse(
            valid,
            expectedDeviceID: "desktop-b",
            expectedLibraryEpoch: "epoch-b"
        ))
        let wrongPeer = try XCTUnwrap(HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: nil,
            headerFields: [
                "Content-Type": FolioleFramedSyncHTTPTransport.contentType,
                "X-Foliole-Device-Id": "desktop-c",
                "X-Foliole-Library-Epoch": "epoch-b"
            ]
        ))
        XCTAssertThrowsError(try FolioleFramedSyncHTTPTransport.validateResponse(
            wrongPeer,
            expectedDeviceID: "desktop-b",
            expectedLibraryEpoch: "epoch-b"
        ))
    }

    func testResponsePreservesOnlyRecoverableProtocolErrors() {
        XCTAssertEqual(FolioleFramedSyncHTTPTransport.httpErrorCode(
            statusCode: 400,
            body: Data(#"{"error":"framed_sync_source_changed"}"#.utf8)
        ), "framed_sync_http_400:framed_sync_source_changed")
        XCTAssertEqual(FolioleFramedSyncHTTPTransport.httpErrorCode(
            statusCode: 400,
            body: Data(#"{"error":"framed_sync_node_parent_missing:parent-1"}"#.utf8)
        ), "framed_sync_http_400:framed_sync_node_parent_missing:parent-1")
        XCTAssertEqual(FolioleFramedSyncHTTPTransport.httpErrorCode(
            statusCode: 400,
            body: Data(#"{"error":"private_server_detail"}"#.utf8)
        ), "framed_sync_http_400")
    }

    private func peer() -> FolioleFramedSyncHTTPPeer {
        FolioleFramedSyncHTTPPeer(
            groupID: "group-a",
            deviceID: "desktop-b",
            libraryEpoch: "epoch-b",
            memberAuthHeaders: [
                "X-Sync-Group-Id": "group-a",
                "X-Device-Id": "ios-a",
                "X-Nonce": "nonce",
                "X-Signature": "signature",
                "X-Timestamp": "2026-10-05T00:00:00Z"
            ]
        )
    }

    private static func readBody(_ request: URLRequest) throws -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else {
            throw FolioleFramedSyncValidationError("test_request_body_missing")
        }
        stream.open()
        defer { stream.close() }
        var result = Data()
        var buffer = [UInt8](repeating: 0, count: 2)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count >= 0 else { throw stream.streamError! }
            if count == 0 { break }
            result.append(buffer, count: count)
        }
        return result
    }
}

private final class FramedSyncURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        do {
            guard let handler = Self.handler else {
                throw FolioleFramedSyncValidationError("test_http_handler_missing")
            }
            let (response, body) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            for offset in stride(from: 0, to: body.count, by: 2) {
                client?.urlProtocol(self, didLoad: body[offset..<min(offset + 2, body.count)])
            }
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
