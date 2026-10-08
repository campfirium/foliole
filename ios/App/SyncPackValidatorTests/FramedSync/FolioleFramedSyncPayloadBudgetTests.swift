import Foundation
import XCTest
import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncPayloadBudgetTests: XCTestCase {
    func testFourIndependentSlotsAndFIFOReleaseAreBounded() async throws {
        let owner = FolioleFramedSyncPayloadBudget(libraryKey: "/temporary/library.sqlite", generationID: "first")
        let outbound = try await acquire(owner, .outbound)
        let inbound = try await acquire(owner, .inbound)
        let receiptOut = try await acquire(owner, .outbound, lane: .receipt)
        let receiptIn = try await acquire(owner, .inbound, lane: .receipt)
        XCTAssertEqual(outbound.slot.capacity + inbound.slot.capacity, 4_194_304)
        XCTAssertEqual(receiptOut.slot.capacity, 1_048_576)
        let first = expectation(description: "first payload waiter")
        let second = expectation(description: "second payload waiter")
        let order = LockedOrder()
        owner.acquire(.outbound) { result in
            do { let loan = try result.get(); order.append(1); loan.release(); first.fulfill() }
            catch { XCTFail("\(error)") }
        }
        owner.acquire(.outbound) { result in
            do { let loan = try result.get(); order.append(2); loan.release(); second.fulfill() }
            catch { XCTFail("\(error)") }
        }
        XCTAssertEqual(order.values, [])
        outbound.release(); outbound.release()
        await fulfillment(of: [first, second], timeout: 2)
        XCTAssertEqual(order.values, [1, 2])
        inbound.release(); receiptOut.release(); receiptIn.release()
    }

    func testGenerationSwitchCancelsWaitersAndWaitsForActiveLoans() async throws {
        let registry = FolioleFramedSyncPayloadBudgetRegistry()
        try await configure(registry, generation: "old")
        let old = try registry.requireCurrent(), active = try await acquire(old, .outbound)
        let cancelled = expectation(description: "old waiter cancelled")
        old.acquire(.outbound) { result in
            if case .success(let loan) = result { loan.release(); XCTFail("retired owner granted a waiting loan") }
            cancelled.fulfill()
        }
        let switched = expectation(description: "new owner installed after drain")
        registry.configure(libraryKey: "/temporary/library.sqlite", generationID: "new") { result in
            if case .failure(let error) = result { XCTFail("\(error)") }
            switched.fulfill()
        }
        XCTAssertThrowsError(try registry.requireCurrent())
        XCTAssertFalse(old.validate(loanID: active.id, slot: active.slot, capacity: 2_097_152))
        await fulfillment(of: [cancelled], timeout: 2)
        active.release()
        await fulfillment(of: [switched], timeout: 2)
        XCTAssertEqual(try registry.requireCurrent().generationID, "new")
        XCTAssertThrowsError(try old.requireActive())
        let denied = expectation(description: "captured old owner remains rejected")
        old.acquire(.inbound) { result in
            if case .success(let loan) = result { loan.release(); XCTFail("old operation moved generations") }
            denied.fulfill()
        }
        await fulfillment(of: [denied], timeout: 2)
    }

    func testSocketCancellationAndFailedConsumerReleaseCapacity() async throws {
        let owner = FolioleFramedSyncPayloadBudget(libraryKey: "/temporary/library.sqlite", generationID: "first")
        let active = try await acquire(owner, .outbound)
        let cancellation = FolioleFramedSyncPayloadCancellation()
        let finished = expectation(description: "cancelled worker returns")
        FolioleFramedSyncPayloadWorker.queue.async {
            do {
                try FolioleFramedSyncPayloadWorker.withCancellation(cancellation) {
                    try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound) { _ in XCTFail("cancelled callback ran") }
                }
                XCTFail("cancelled borrow succeeded")
            } catch { finished.fulfill() }
        }
        cancellation.cancel(); active.release()
        await fulfillment(of: [finished], timeout: 2)
        try await FolioleFramedSyncPayloadWorker.run {
            XCTAssertThrowsError(try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound) { _ in
                throw FolioleFramedSyncValidationError("injected_consumer_failure")
            })
        }
        let retry = try await acquire(owner, .outbound); retry.release()
        XCTAssertThrowsError(try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound) { _ in })
    }

    func testProducerOutlivesTimedOutNativeConsumerUntilFinallyRelease() async throws {
        let registry = FolioleFramedSyncPayloadBudgetRegistry()
        try await configure(registry, generation: "old")
        let owner = try registry.requireCurrent(), loan = try await acquire(owner, .outbound)
        XCTAssertTrue(owner.validate(loanID: loan.id, slot: loan.slot, capacity: 2_097_152))
        XCTAssertTrue(owner.validate(loanID: loan.id, slot: loan.slot, capacity: 2_097_152))
        loan.release() // Native request timed out; JS producer still owns its number array/DB read.
        let state = LockedOrder()
        let closed = expectation(description: "close waits for JS finally")
        registry.close(libraryKey: owner.libraryKey, generationID: owner.generationID) { result in
            if case .failure(let error) = result { XCTFail("\(error)") }
            state.append(1); closed.fulfill()
        }
        XCTAssertEqual(state.values, [])
        XCTAssertFalse(owner.validate(loanID: loan.id, slot: loan.slot, capacity: 2_097_152))
        registry.releaseProducer(libraryKey: owner.libraryKey, generationID: "other", loanID: loan.id,
            slot: loan.slot, capacity: 2_097_152)
        XCTAssertEqual(state.values, [])
        registry.releaseProducer(libraryKey: owner.libraryKey, generationID: owner.generationID, loanID: loan.id,
            slot: loan.slot, capacity: 2_097_152)
        await fulfillment(of: [closed], timeout: 2)
        registry.releaseProducer(libraryKey: owner.libraryKey, generationID: owner.generationID, loanID: loan.id,
            slot: loan.slot, capacity: 2_097_152)
        XCTAssertEqual(state.values, [1])
    }

    func testReceiptRejectsOversizedCiphertextBeforeReadingBody() throws {
        let preamble = try FolioleFramedSyncTransferWriter.makePreamble(
            transferID: Data(repeating: 1, count: 32), attemptID: Data(repeating: 2, count: 16), noncePrefix: Data(repeating: 3, count: 4))
        let header = try FolioleFramedSyncWireHeader(ciphertextBytes: 1_048_577, sequence: 0, frameType: .transferReceipt).encode()
        XCTAssertThrowsError(try FolioleFramedSyncReceiptReader.read(preamble.encoded + header,
            groupKey: Data(repeating: 0, count: 32), transferID: preamble.contextID,
            contentID: Data(repeating: 4, count: 32), receiverDeviceID: "receiver", receiverLibraryEpoch: "epoch")) { error in
            XCTAssertEqual(error.localizedDescription, "framed_sync_frame_ciphertext_limit_exceeded")
        }
    }

    private func acquire(_ owner: FolioleFramedSyncPayloadBudget, _ direction: FolioleFramedSyncPayloadBudget.Direction,
                         lane: FolioleFramedSyncPayloadBudget.Lane = .payload) async throws -> FolioleFramedSyncPayloadBudget.Loan {
        try await withCheckedThrowingContinuation { continuation in owner.acquire(direction, lane: lane) { continuation.resume(with: $0) } }
    }
    private func configure(_ registry: FolioleFramedSyncPayloadBudgetRegistry, generation: String) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            registry.configure(libraryKey: "/temporary/library.sqlite", generationID: generation) { continuation.resume(with: $0) }
        }
    }
}

private final class LockedOrder: @unchecked Sendable {
    private let lock = NSLock()
    private var order = [Int]()
    var values: [Int] { lock.lock(); defer { lock.unlock() }; return order }
    func append(_ value: Int) { lock.lock(); order.append(value); lock.unlock() }
}
