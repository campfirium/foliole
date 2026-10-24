import Foundation
import XCTest
@testable import FolioleSyncPackValidator

@MainActor final class FolioleAttachmentHTTPBoundaryTests: XCTestCase {
    private func fixture() throws -> (URL, URL, URL) {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { root.deleteLastPathComponent() }
        let directory = root.appendingPathComponent(".tmp/artifacts/t438-http-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let request = directory.appendingPathComponent("request"), response = directory.appendingPathComponent("response")
        try Data([1]).write(to: request)
        return (directory, request, response)
    }
    private func peer() -> FolioleFramedSyncHTTPPeer {
        .init(groupID: "group", deviceID: "peer", libraryEpoch: "epoch", memberAuthHeaders: [
            "X-Sync-Group-Id": "group", "X-Device-Id": "local", "X-Nonce": "nonce", "X-Signature": "signature", "X-Timestamp": "time"])
    }
    func testCancelsWhileWaitingForResponseBytesWithoutWaitingForWindowCompletion() async throws {
        let (directory, request, response) = try fixture(); defer { try? FileManager.default.removeItem(at: directory) }
        let started = expectation(description: "started"), stopped = expectation(description: "stopped"), finished = expectation(description: "finished")
        AttachmentBoundaryProtocol.started = { started.fulfill() }; AttachmentBoundaryProtocol.stopped = { stopped.fulfill() }
        AttachmentBoundaryProtocol.bytes = nil
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [AttachmentBoundaryProtocol.self]
        var failure: Error?
        let work = Task {
            do { _ = try await FolioleFramedSyncHTTPTransport.post(endpoint: URL(string: "http://127.0.0.1/blocked")!,
                peer: peer(), requestBodyURL: request, responseBodyURL: response, configuration: config, maximumResponseBytes: 1024) }
            catch { failure = error }
            finished.fulfill()
        }
        await fulfillment(of: [started], timeout: 2)
        work.cancel()
        await fulfillment(of: [stopped, finished], timeout: 2)
        XCTAssertEqual((failure as? URLError)?.code, .cancelled)
        XCTAssertFalse(FileManager.default.fileExists(atPath: response.path))
        AttachmentBoundaryProtocol.started = nil; AttachmentBoundaryProtocol.stopped = nil
    }
    func testRejectsActualBytesOverTheLimitWithoutTrustingContentLength() async throws {
        let (directory, request, response) = try fixture(); defer { try? FileManager.default.removeItem(at: directory) }
        AttachmentBoundaryProtocol.started = nil; AttachmentBoundaryProtocol.stopped = nil
        AttachmentBoundaryProtocol.bytes = Data(repeating: 7, count: 4096)
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [AttachmentBoundaryProtocol.self]
        do {
            _ = try await FolioleFramedSyncHTTPTransport.post(endpoint: URL(string: "http://127.0.0.1/oversized")!, peer: peer(),
                requestBodyURL: request, responseBodyURL: response, configuration: config, maximumResponseBytes: 128)
            XCTFail("Oversized response was accepted")
        } catch { XCTAssertTrue(error.localizedDescription.contains("attachment_response_byte_limit")) }
        XCTAssertFalse(FileManager.default.fileExists(atPath: response.path))
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path), ["request"])
    }
}

private final class AttachmentBoundaryProtocol: URLProtocol {
    static var bytes: Data?
    static var started: (() -> Void)?
    static var stopped: (() -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil,
            headerFields: ["Content-Type": FolioleFramedSyncHTTPTransport.contentType,
                "X-Foliole-Device-Id": "peer", "X-Foliole-Library-Epoch": "epoch"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        Self.started?()
        if let bytes = Self.bytes { client?.urlProtocol(self, didLoad: bytes); client?.urlProtocolDidFinishLoading(self) }
    }
    override func stopLoading() { Self.stopped?() }
}
