import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleAttachmentHTTPCancellationTests: XCTestCase {
    func testCancellationReachesBlockedDelegateAndWaitsForActualWriterExit() async throws {
        let fixture = try AttachmentBlockStorageFixture(); defer { fixture.close() }
        try fixture.call("truncate", numbers: ["length": 0])
        let writer = try fixture.storage.receive(key: fixture.key, offset: 0, check: {}) { fixture.storage.finishReceive(fixture.key) }
        defer { try? writer.close() }
        let server = try AttachmentStreamingHTTPServer(prefix: Data([1]), suffix: Data([2]))
        defer { server.close() }
        let entered = expectation(description: "delegate writing")
        let cancelled = expectation(description: "cancel reaches delegate independently")
        let exited = expectation(description: "HTTP actually exited")
        let exitedSignal = DispatchSemaphore(value: 0)
        let release = DispatchSemaphore(value: 0)
        defer { release.signal() }
        let cancellation = FolioleFramedSyncPayloadCancellation()
        let request = fixture.directory.appendingPathComponent("request")
        let response = fixture.directory.appendingPathComponent("response")
        try Data([1]).write(to: request)
        let config = URLSessionConfiguration.ephemeral
        config.connectionProxyDictionary = [:]
        config.timeoutIntervalForResource = 5
        let work = Task {
            defer { exitedSignal.signal(); exited.fulfill() }
            do {
                _ = try await FolioleFramedSyncHTTPTransport.post(endpoint: server.endpoint,
                    peer: .init(groupID: "group", deviceID: "b", libraryEpoch: "b-epoch", memberAuthHeaders: [
                        "x-device-id": "a", "x-nonce": "test", "x-signature": "test", "x-timestamp": "test"]),
                    requestBodyURL: request, responseBodyURL: response, configuration: config,
                    bodyConsumer: .init(append: { data in
                        try writer.append(offset: 0, data: data)
                        entered.fulfill()
                        _ = release.wait(timeout: .now() + 3)
                        if cancellation.isCancelled { throw CancellationError() }
                    }, finish: { XCTFail("Cancelled response completed") }, cancel: {
                        cancellation.cancel(); cancelled.fulfill()
                    }))
                XCTFail("Cancelled HTTP succeeded")
            } catch { XCTAssertTrue(error is CancellationError || (error as? URLError)?.code == .cancelled) }
        }
        await fulfillment(of: [entered], timeout: 2)
        work.cancel()
        await fulfillment(of: [cancelled], timeout: 1)
        XCTAssertEqual(exitedSignal.wait(timeout: .now() + 0.05), .timedOut)
        release.signal()
        await fulfillment(of: [exited], timeout: 2)
        await work.value
        XCTAssertEqual(try Data(contentsOf: fixture.partial), Data([1]))
        XCTAssertFalse(FileManager.default.fileExists(atPath: response.path))
    }
}
