import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncOwnedBridgeTests: XCTestCase {
    func testCancelledQueuedEventCannotReachNewDocumentAndNewRequestStillResolves() async throws {
        let events = Events()
        let bridge = FolioleCompanionSyncGroupDataBridge { events.append($0) }
        let old = FolioleFramedSyncPayloadBudget(libraryKey: "/temporary/business.db", generationID: "old")
        let owned = FolioleFramedSyncOwnedBridge(bridge: bridge, owner: old)
        let cancelled = expectation(description: "old control request cancelled")
        DispatchQueue.global().async {
            do { _ = try owned.request("complete_framed_outbound", [:]); XCTFail("old request must fail") } catch {}
            cancelled.fulfill()
        }
        let event = try await events.next()
        XCTAssertTrue(bridge.shouldDispatch(event))
        bridge.cancelPending(documentOwner: old)
        XCTAssertFalse(bridge.shouldDispatch(event))
        XCTAssertThrowsError(try bridge.resolve(["request_id": event["request_id"]!, "result": [:]]))
        await fulfillment(of: [cancelled], timeout: 2)

        let new = FolioleFramedSyncPayloadBudget(libraryKey: "/temporary/business.db", generationID: "new")
        let completed = expectation(description: "new document control succeeds")
        DispatchQueue.global().async {
            do {
                let result = try FolioleFramedSyncOwnedBridge(bridge: bridge, owner: new).request("load_member_state", [:])
                XCTAssertEqual(result["library_epoch"] as? String, "new-epoch")
            } catch { XCTFail("\(error)") }
            completed.fulfill()
        }
        let newEvent = try await events.next()
        bridge.cancelPending(documentOwner: old)
        XCTAssertTrue(bridge.shouldDispatch(newEvent))
        try bridge.resolve(["request_id": newEvent["request_id"]!, "result": ["library_epoch": "new-epoch"]])
        await fulfillment(of: [completed], timeout: 2)
        XCTAssertFalse(bridge.shouldDispatch(newEvent))
    }

    func testCapturedOwnerCannotRetagLateControlAfterGenerationSwitch() async throws {
        let registry = FolioleFramedSyncPayloadBudgetRegistry()
        try await configure(registry, generation: "old")
        let old = try registry.requireCurrent(), events = Events()
        let bridge = FolioleCompanionSyncGroupDataBridge { events.append($0) }
        let captured = FolioleFramedSyncOwnedBridge(bridge: bridge, owner: old)
        try await configure(registry, generation: "new")
        XCTAssertThrowsError(try captured.request("inspect_framed_outbound", ["receipt_only": true]))
        XCTAssertThrowsError(try captured.request("complete_framed_outbound", [:]))
        XCTAssertThrowsError(try captured.request("load_member_state", [:]))
        XCTAssertEqual(events.count, 0)
        XCTAssertEqual(try registry.requireCurrent().generationID, "new")
    }

    func testRetiredOwnerQueuedEventIsRejectedWithoutEmitting() async throws {
        let events = Events(), owner = FolioleFramedSyncPayloadBudget(libraryKey: "/temporary/business.db", generationID: "old")
        let bridge = FolioleCompanionSyncGroupDataBridge { events.append($0) }
        let rejected = expectation(description: "queued retired control rejected")
        DispatchQueue.global().async {
            do { _ = try bridge.request("load_member_state", [:], documentOwner: owner); XCTFail("retired request must fail") } catch {}
            rejected.fulfill()
        }
        let event = try await events.next()
        owner.retire({})
        XCTAssertFalse(bridge.shouldDispatch(event))
        await fulfillment(of: [rejected], timeout: 2)
    }

    private func configure(_ registry: FolioleFramedSyncPayloadBudgetRegistry, generation: String) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            registry.configure(libraryKey: "/temporary/business.db", generationID: generation) { continuation.resume(with: $0) }
        }
    }

    private final class Events: @unchecked Sendable {
        private let lock = NSLock()
        private var values: [[String: Any]] = []
        private var waiter: CheckedContinuation<[String: Any], Error>?
        var count: Int { lock.withLock { values.count } }
        func append(_ value: [String: Any]) {
            lock.lock()
            let pending = waiter; waiter = nil
            if pending == nil { values.append(value) }
            lock.unlock()
            pending?.resume(returning: value)
        }
        func next() async throws -> [String: Any] {
            try await withCheckedThrowingContinuation { continuation in
                lock.lock()
                if !values.isEmpty {
                    let value = values.removeFirst(); lock.unlock(); continuation.resume(returning: value)
                } else { waiter = continuation; lock.unlock() }
            }
        }
    }
}
