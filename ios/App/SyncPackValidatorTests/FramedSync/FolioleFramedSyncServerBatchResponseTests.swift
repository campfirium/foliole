import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncServerBatchResponseTests: XCTestCase {
    private func directory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    func testValidatesEveryRequestBeforeSealingAnyPrefix() throws {
        let root = try directory()
        defer { try? FileManager.default.removeItem(at: root) }
        var sealed = 0
        XCTAssertThrowsError(try FolioleFramedSyncServerBatchResponse.write([Data([1]), Data([2])],
            to: root.appendingPathComponent("response"), owner: FolioleFramedSyncPayloadBudget(libraryKey: "test", generationID: UUID().uuidString),
            inspect: { if $0 == Data([2]) { throw NSError(domain: "source-changed", code: 1) } },
            seal: { _, _ in sealed += 1; throw NSError(domain: "unexpected-seal", code: 1) }))
        XCTAssertEqual(sealed, 0)
    }

    func testWritesStablePrefixAndDisposesOnlyOneLookahead() throws {
        try assertPrefix(sizes: [400_000, 400_000, 400_000, 10], ready: [true, true, true, true],
            appended: [0, 1], sealed: [0, 1, 2])
    }

    func testFirstLargeAndFirstUnsafeKeepTheirOriginalSingleUnit() throws {
        try assertPrefix(sizes: [3_000_000, 10], ready: [true, true], appended: [0], sealed: [0])
        try assertPrefix(sizes: [10, 10], ready: [false, true], appended: [0], sealed: [0])
        try assertPrefix(sizes: [10, 10, 10], ready: [true, false, true], appended: [0], sealed: [0, 1])
    }

    func testImmediateTailAndTargetBoundary() throws {
        try assertPrefix(sizes: [10, 10], ready: [true, true], appended: [0, 1], sealed: [0, 1])
        try assertPrefix(sizes: [1_048_576, 10], ready: [true, true], appended: [0], sealed: [0])
    }

    private func assertPrefix(sizes: [UInt64], ready: [Bool], appended: [Int], sealed expected: [Int]) throws {
        let root = try directory()
        defer { try? FileManager.default.removeItem(at: root) }
        var inspected = [Int](), sealed = [Int](), disposed = [Int]()
        let requests = sizes.indices.map { Data([UInt8($0)]) }
        let result = try FolioleFramedSyncPayloadWorker.queue.sync {
            try FolioleFramedSyncServerBatchResponse.write(requests,
            to: root.appendingPathComponent("response"), owner: FolioleFramedSyncPayloadBudget(libraryKey: "test", generationID: UUID().uuidString),
            inspect: { inspected.append(Int($0[0])) }, seal: { _, index in
                XCTAssertEqual(inspected, Array(sizes.indices))
                sealed.append(index)
                let url = root.appendingPathComponent("unit-\(index)")
                try Data([UInt8(index)]).write(to: url)
                return .init(url: url, messageBytes: sizes[index], batchReady: ready[index],
                    dispose: { disposed.append(index); try? FileManager.default.removeItem(at: url) })
            })
        }
        XCTAssertEqual(try Data(contentsOf: result), Data(appended.map(UInt8.init)))
        XCTAssertEqual(sealed, expected)
        XCTAssertEqual(disposed, expected)
    }
}
