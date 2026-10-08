import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncPayloadBudgetRegistry: @unchecked Sendable {
    static let shared = FolioleFramedSyncPayloadBudgetRegistry()
    private let lock = NSLock()
    private var owner: FolioleFramedSyncPayloadBudget?
    private var retiring: FolioleFramedSyncPayloadBudget?
    private var transitioning = false
    private var documentInvalidation = false
    private var replacement: (String, String, (Result<Void, Error>) -> Void)?
    var documentOwner: FolioleFramedSyncPayloadBudget? {
        lock.lock(); defer { lock.unlock() }; return owner
    }

    func requireCurrent() throws -> FolioleFramedSyncPayloadBudget {
        lock.lock(); defer { lock.unlock() }
        guard !transitioning, let owner else { throw invalid("framed_sync_payload_budget_not_configured") }
        try owner.requireActive()
        return owner
    }

    func configure(libraryKey: String, generationID: String, complete: @escaping (Result<Void, Error>) -> Void) {
        lock.lock()
        if transitioning && documentInvalidation && replacement == nil {
            replacement = (libraryKey, generationID, complete); lock.unlock(); return
        }
        guard !transitioning else { lock.unlock(); complete(.failure(invalid("framed_sync_payload_budget_transition"))); return }
        if let owner, owner.libraryKey == libraryKey, owner.generationID == generationID {
            lock.unlock(); complete(.success(())); return
        }
        transitioning = true
        let old = owner; retiring = old; owner = nil
        lock.unlock()
        let install = {
            self.lock.lock()
            self.owner = .init(libraryKey: libraryKey, generationID: generationID)
            self.transitioning = false; self.retiring = nil
            self.lock.unlock()
            complete(.success(()))
        }
        if let old { old.retire(install) } else { install() }
    }

    func close(libraryKey: String, generationID: String, complete: @escaping (Result<Void, Error>) -> Void) {
        lock.lock()
        guard !transitioning else { lock.unlock(); complete(.failure(invalid("framed_sync_payload_budget_transition"))); return }
        guard let old = owner else { lock.unlock(); complete(.success(())); return }
        guard old.libraryKey == libraryKey, old.generationID == generationID else {
            lock.unlock(); complete(.failure(invalid("framed_sync_payload_budget_identity_mismatch"))); return
        }
        transitioning = true; retiring = old; owner = nil
        lock.unlock()
        old.retire {
            self.lock.lock(); self.transitioning = false; self.retiring = nil; self.lock.unlock()
            complete(.success(()))
        }
    }

    func invalidateDocument(_ captured: FolioleFramedSyncPayloadBudget) {
        lock.lock()
        guard owner === captured else {
            lock.unlock(); captured.invalidateProducerContext({}); return
        }
        owner = nil; retiring = captured; transitioning = true; documentInvalidation = true
        lock.unlock()
        captured.invalidateProducerContext {
            self.lock.lock()
            let next = self.replacement; self.replacement = nil
            self.owner = next.map { .init(libraryKey: $0.0, generationID: $0.1) }
            self.retiring = nil; self.transitioning = false; self.documentInvalidation = false
            self.lock.unlock()
            next?.2(.success(()))
        }
    }

    func releaseProducer(libraryKey: String, generationID: String, loanID: String,
        slot: FolioleFramedSyncPayloadBudget.Slot, capacity: Int) {
        lock.lock()
        let matching = [owner, retiring].compactMap { $0 }.first { $0.libraryKey == libraryKey && $0.generationID == generationID }
        lock.unlock()
        matching?.releaseProducer(loanID, slot: slot, capacity: capacity)
    }

    private func invalid(_ code: String) -> Error { FolioleFramedSyncValidationError(code) }
}
