import Foundation
import Network
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncFileResponseTests: XCTestCase {
    func testCancelledNativeResponseReleasesItsRound() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("response.body")
        try Data(repeating: 7, count: 64 * 1024).write(to: file)
        let connection = NWConnection(host: "127.0.0.1", port: 1, using: .tcp)
        connection.start(queue: DispatchQueue(label: "response-cancellation-test"))
        connection.cancel()
        let released = expectation(description: "Round released after native send failure")
        released.assertForOverFulfill = true
        try FolioleFramedSyncFileResponse.sendFile(connection, url: file, directory: directory,
            deviceID: "peer", epoch: "epoch", onComplete: {
                XCTFail("A cancelled connection must not report a completed response")
            }, onInterrupted: { released.fulfill() })
        await fulfillment(of: [released], timeout: 3)
    }
}
