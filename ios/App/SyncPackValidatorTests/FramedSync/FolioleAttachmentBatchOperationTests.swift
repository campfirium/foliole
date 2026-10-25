import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleAttachmentBatchOperationTests: XCTestCase {
    private func operation(_ fixture: AttachmentBatchFileFixture, owner: FolioleFramedSyncPayloadBudget,
                           progress: @escaping () -> Void = {}) throws -> FolioleAttachmentBatchOperation {
        try .init(id: "operation", owner: owner, storage: fixture.files.storage, capacity: fixture.capacity,
            requestID: Data(count: 16), entries: fixture.entries, context: AttachmentBatchWireFixture.context(),
            initiatorEpoch: "a-epoch", wake: {}, cancelData: {}, hashProgress: progress)
    }
    private func data(_ fixture: AttachmentBatchFileFixture, operation: FolioleAttachmentBatchOperation, end: Bool = true) throws {
        try operation.start()
        for value in end ? fixture.messages : Array(fixture.messages.dropLast()) {
            let event = try operation.permission.accept(value, encodedBytes: value.serializedData().count)
            try operation.receiver.accept(event, value)
        }
        if end { try operation.permission.finish() }
    }
    func testLostHttpAndClaimResponsesRetainTheResultAndQuotaUntilSqlSettlement() throws {
        let fixture = try AttachmentBatchFileFixture(count: 1); defer { fixture.close() }
        let owner = FolioleFramedSyncPayloadBudget(libraryKey: "library", generationID: "generation")
        let operation = try operation(fixture, owner: owner)
        try data(fixture, operation: operation); try operation.finishData(nil)
        XCTAssertEqual(operation.snapshot().state, "data_complete"); XCTAssertFalse(operation.closed)
        let fact = try XCTUnwrap(operation.snapshot().files.first)
        try operation.queue.claim([fact.sequence]); try operation.queue.claim([fact.sequence])
        XCTAssertEqual(fixture.capacity.used, 1); XCTAssertTrue(try operation.verify(fact.sequence))
        try operation.finalize("publish", fact.sequence); try operation.finalize("publish", fact.sequence)
        XCTAssertFalse(operation.closed); XCTAssertEqual(fixture.capacity.used, 1)
        try operation.receiver.settle(fact.sequence, published: true); operation.changed()
        try operation.receiver.settle(fact.sequence, published: true); operation.changed()
        XCTAssertTrue(operation.closed); XCTAssertEqual(operation.snapshot().outcome, "complete"); XCTAssertEqual(fixture.capacity.used, 0)
    }
    func testRetirementDoesNotDrainUntilTheActualHttpOperationExits() throws {
        let fixture = try AttachmentBatchFileFixture(count: 1); defer { fixture.close() }
        let owner = FolioleFramedSyncPayloadBudget(libraryKey: "library", generationID: "generation")
        let operation = try operation(fixture, owner: owner)
        try operation.start()
        let drained = expectation(description: "actual HTTP exit acknowledged")
        owner.retire { drained.fulfill() }
        XCTAssertFalse(operation.closed); XCTAssertThrowsError(try operation.check())
        XCTAssertThrowsError(try operation.finishData(CancellationError()))
        wait(for: [drained], timeout: 1); XCTAssertTrue(operation.closed)
    }
    func testTimeoutWaitsForTheActualHashAndPreservesItsRecoverablePartial() throws {
        var now: TimeInterval = 0
        let fixture = try AttachmentBatchFileFixture(count: 1, now: { now }); defer { fixture.close() }
        let owner = FolioleFramedSyncPayloadBudget(libraryKey: "library", generationID: "generation")
        let hashing = expectation(description: "hash has read a real block")
        let finished = expectation(description: "native hash exited")
        let release = DispatchSemaphore(value: 0)
        var blocked = false
        let operation = try operation(fixture, owner: owner) {
            if blocked { return }; blocked = true; hashing.fulfill()
            XCTAssertEqual(release.wait(timeout: .now() + 5), .success)
        }
        try data(fixture, operation: operation); try operation.finishData(nil)
        let fact = try XCTUnwrap(operation.snapshot().files.first); try operation.queue.claim([fact.sequence])
        DispatchQueue.global().async {
            do { _ = try operation.verify(fact.sequence); XCTFail("Cancelled hash completed") } catch {}
            finished.fulfill()
        }
        wait(for: [hashing], timeout: 1)
        now = 60; operation.expire()
        XCTAssertFalse(operation.closed); XCTAssertEqual(fixture.capacity.used, 1)
        XCTAssertThrowsError(try fixture.files.storage.execute(action: "truncate", key: fact.key, number: { _ in 0 }))
        release.signal(); wait(for: [finished], timeout: 2)
        XCTAssertTrue(operation.closed); XCTAssertEqual(fixture.capacity.used, 0)
        XCTAssertFalse(FileManager.default.fileExists(atPath: fixture.files.root.appendingPathComponent(fact.key).path))
        XCTAssertEqual(try Data(contentsOf: fixture.files.storage.resolve(fact.key, partial: true)).count, 131072)
    }
    func testMissingBatchEndDoesNotPreventAnIndependentSealedFileFromFinishing() throws {
        let fixture = try AttachmentBatchFileFixture(count: 1); defer { fixture.close() }
        let owner = FolioleFramedSyncPayloadBudget(libraryKey: "library", generationID: "generation")
        let operation = try operation(fixture, owner: owner)
        try data(fixture, operation: operation, end: false)
        XCTAssertThrowsError(try operation.finishData(CancellationError()))
        XCTAssertEqual(operation.snapshot().state, "data_failed")
        let fact = try XCTUnwrap(operation.snapshot().files.first); try operation.queue.claim([fact.sequence])
        XCTAssertTrue(try operation.verify(fact.sequence)); try operation.finalize("publish", fact.sequence)
        try operation.receiver.settle(fact.sequence, published: true); operation.changed()
        XCTAssertTrue(operation.closed); XCTAssertEqual(operation.snapshot().outcome, "failed")
        XCTAssertTrue(FileManager.default.fileExists(atPath: fixture.files.root.appendingPathComponent(fact.key).path))
    }
}
