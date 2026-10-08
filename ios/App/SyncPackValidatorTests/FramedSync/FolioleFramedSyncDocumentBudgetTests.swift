import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncDocumentBudgetTests: XCTestCase {
    func testReloadDropsProducerReferenceButDrainsLateNativeConsumerBeforeNewGeneration() async throws {
        let registry = FolioleFramedSyncPayloadBudgetRegistry()
        try await configure(registry, generation: "old")
        let old = try registry.requireCurrent(), native = try await acquire(old)
        XCTAssertTrue(old.validate(loanID: native.id, slot: native.slot, capacity: 2_097_152))
        let document = FolioleFramedSyncDocumentOwner(invalidate: registry.invalidateDocument)
        document.configured(old); document.started(); document.committed()
        XCTAssertThrowsError(try registry.requireCurrent())
        XCTAssertFalse(old.validate(loanID: native.id, slot: native.slot, capacity: 2_097_152))
        let installed = expectation(description: "new document waits for old native consumer")
        registry.configure(libraryKey: "/temporary/business.db", generationID: "new") { result in
            if case .failure(let error) = result { XCTFail("\(error)") }
            installed.fulfill()
        }
        XCTAssertThrowsError(try registry.requireCurrent())
        native.release()
        await fulfillment(of: [installed], timeout: 2)
        let new = try registry.requireCurrent()
        XCTAssertEqual(new.generationID, "new")
        registry.releaseProducer(libraryKey: old.libraryKey, generationID: old.generationID, loanID: native.id,
            slot: native.slot, capacity: 2_097_152)
        let next = try await acquire(new); next.release()
    }

    func testCapturedOldDocumentCannotInvalidateAnAlreadyConfiguredNewGeneration() async throws {
        let registry = FolioleFramedSyncPayloadBudgetRegistry()
        try await configure(registry, generation: "old")
        let captured = try registry.requireCurrent()
        let document = FolioleFramedSyncDocumentOwner(invalidate: registry.invalidateDocument)
        document.configured(captured); document.started(); document.failed()
        let stillActive = try await acquire(captured); stillActive.release()
        document.started()
        try await configure(registry, generation: "new")
        let new = try registry.requireCurrent()
        document.configured(new); document.committed()
        XCTAssertTrue(try registry.requireCurrent() === new)
        let next = try await acquire(new); next.release()
    }

    func testTerminatedDocumentClearsProducerButKeepsNativeReference() async throws {
        let registry = FolioleFramedSyncPayloadBudgetRegistry()
        try await configure(registry, generation: "old")
        let old = try registry.requireCurrent(), loan = try await acquire(old)
        XCTAssertTrue(old.validate(loanID: loan.id, slot: loan.slot, capacity: 2_097_152))
        let document = FolioleFramedSyncDocumentOwner(invalidate: registry.invalidateDocument)
        document.configured(old); document.terminated()
        XCTAssertNil(document.owner)
        XCTAssertThrowsError(try old.requireActive())
        let configured = Task { try await self.configure(registry, generation: "new") }
        loan.release()
        try await configured.value
        XCTAssertEqual(try registry.requireCurrent().generationID, "new")
    }

    private func configure(_ registry: FolioleFramedSyncPayloadBudgetRegistry, generation: String) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            registry.configure(libraryKey: "/temporary/business.db", generationID: generation) { continuation.resume(with: $0) }
        }
    }
    private func acquire(_ owner: FolioleFramedSyncPayloadBudget) async throws -> FolioleFramedSyncPayloadBudget.Loan {
        try await withCheckedThrowingContinuation { continuation in owner.acquire(.outbound) { continuation.resume(with: $0) } }
    }
}
