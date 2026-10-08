import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncPayloadBudget: @unchecked Sendable {
    enum Direction: String { case inbound, outbound }
    enum Lane: String { case payload, receipt }
    struct Slot: Hashable {
        let direction: Direction
        let lane: Lane
        var capacity: Int { lane == .payload ? 2_097_152 : 1_048_576 }
    }
    final class Loan: @unchecked Sendable {
        let requestID: UUID
        let id = UUID().uuidString
        let owner: FolioleFramedSyncPayloadBudget
        let slot: Slot
        fileprivate init(owner: FolioleFramedSyncPayloadBudget, slot: Slot, requestID: UUID) {
            self.owner = owner; self.slot = slot; self.requestID = requestID
        }
        var payload: [String: Any] {
            ["library_key": owner.libraryKey, "generation_id": owner.generationID, "loan_id": id,
             "direction": slot.direction.rawValue, "lane": slot.lane.rawValue, "capacity_bytes": slot.capacity]
        }
        func release() { owner.release(id) }
    }
    private struct Waiting {
        let id: UUID
        let slot: Slot
        let complete: (Result<Loan, Error>) -> Void
    }
    let libraryKey: String
    let generationID: String
    private let lock = NSLock()
    private let callbacks = DispatchQueue(label: "com.campfirium.foliole.framed-budget", attributes: .concurrent)
    private var accepting = true
    private struct Borrow { let loan: Loan; var nativeHeld = true; var producerHeld = false }
    private var active = [String: Borrow]()
    private var waiting = [Waiting]()
    private var drained = [() -> Void]()

    init(libraryKey: String, generationID: String) { self.libraryKey = libraryKey; self.generationID = generationID }

    @discardableResult
    func acquire(_ direction: Direction, lane: Lane = .payload,
                 complete: @escaping (Result<Loan, Error>) -> Void) -> UUID {
        let id = UUID(), slot = Slot(direction: direction, lane: lane)
        lock.lock()
        if !accepting {
            lock.unlock(); callbacks.async { complete(.failure(Self.closed())) }; return id
        }
        waiting.append(.init(id: id, slot: slot, complete: complete))
        let grants = grantLocked()
        lock.unlock()
        deliver(grants)
        return id
    }

    func cancel(_ id: UUID) {
        lock.lock()
        let index = waiting.firstIndex { $0.id == id }
        let request = index.map { waiting.remove(at: $0) }
        lock.unlock()
        if let request { callbacks.async { request.complete(.failure(Self.closed())) } }
    }

    func retire(_ complete: @escaping () -> Void) {
        lock.lock(); accepting = false
        let abandoned = waiting; waiting.removeAll()
        let ready = active.isEmpty
        if !ready { drained.append(complete) }
        lock.unlock()
        for request in abandoned { callbacks.async { request.complete(.failure(Self.closed())) } }
        if ready { callbacks.async(execute: complete) }
    }

    func invalidateProducerContext(_ complete: @escaping () -> Void) {
        retire(complete)
        lock.lock()
        let producers = active.values.filter(\.producerHeld).map(\.loan)
        lock.unlock()
        for loan in producers { releaseProducer(loan.id, slot: loan.slot, capacity: loan.slot.capacity) }
    }

    func validate(loanID: String, slot: Slot, capacity: Int) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard accepting, capacity == slot.capacity, var borrow = active[loanID], borrow.loan.slot == slot else { return false }
        borrow.producerHeld = true; active[loanID] = borrow
        return true
    }

    func requireActive() throws {
        lock.lock(); defer { lock.unlock() }
        guard accepting else { throw Self.closed() }
    }

    func releaseProducer(_ id: String, slot: Slot, capacity: Int) {
        releaseReference(id, producer: true, slot: slot, capacity: capacity)
    }

    private func release(_ id: String) { releaseReference(id, producer: false) }

    private func releaseReference(_ id: String, producer: Bool, slot: Slot? = nil, capacity: Int? = nil) {
        lock.lock()
        guard var borrow = active[id] else { lock.unlock(); return }
        if producer {
            guard borrow.producerHeld, slot == borrow.loan.slot, capacity == borrow.loan.slot.capacity else { lock.unlock(); return }
            borrow.producerHeld = false
        } else { borrow.nativeHeld = false }
        if borrow.nativeHeld || borrow.producerHeld { active[id] = borrow; lock.unlock(); return }
        active.removeValue(forKey: id)
        let grants = grantLocked()
        let completions = !accepting && active.isEmpty ? drained : []
        if !completions.isEmpty { drained.removeAll() }
        lock.unlock()
        deliver(grants)
        for complete in completions { callbacks.async(execute: complete) }
    }

    private func grantLocked() -> [(Waiting, Loan)] {
        guard accepting else { return [] }
        var grants = [(Waiting, Loan)](), index = 0
        while index < waiting.count {
            let request = waiting[index]
            if active.values.contains(where: { $0.loan.slot == request.slot }) { index += 1; continue }
            waiting.remove(at: index)
            let loan = Loan(owner: self, slot: request.slot, requestID: request.id)
            active[loan.id] = Borrow(loan: loan); grants.append((request, loan))
        }
        return grants
    }

    private func deliver(_ grants: [(Waiting, Loan)]) {
        for (request, loan) in grants { callbacks.async { request.complete(.success(loan)) } }
    }

    private static func closed() -> Error { FolioleFramedSyncValidationError("framed_sync_payload_budget_closed") }
}
