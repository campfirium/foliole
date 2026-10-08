import Foundation
import FolioleFramedSyncRuntime

/** Synchronous codec/SQLite loops run here, never on NW, main, or the Swift cooperative executor. */
enum FolioleFramedSyncPayloadWorker {
    private static let cancellationKey = "FolioleFramedSyncPayloadCancellation"
    static var currentCancellation: FolioleFramedSyncPayloadCancellation? {
        Thread.current.threadDictionary[cancellationKey] as? FolioleFramedSyncPayloadCancellation
    }
    static func withCancellation<T>(_ cancellation: FolioleFramedSyncPayloadCancellation?, _ operation: () throws -> T) rethrows -> T {
        let old = Thread.current.threadDictionary[cancellationKey]
        Thread.current.threadDictionary[cancellationKey] = cancellation
        defer { Thread.current.threadDictionary[cancellationKey] = old }
        return try operation()
    }
    private static let key = DispatchSpecificKey<Bool>()
    static let queue: DispatchQueue = {
        let value = DispatchQueue(label: "com.campfirium.foliole.framed-payload-worker", attributes: .concurrent)
        value.setSpecific(key: key, value: true)
        return value
    }()

    static func run<T>(_ operation: @escaping () throws -> T) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            queue.async { continuation.resume(with: Result { try operation() }) }
        }
    }

    static func withLoan<T>(_ owner: FolioleFramedSyncPayloadBudget?, direction: FolioleFramedSyncPayloadBudget.Direction,
        lane: FolioleFramedSyncPayloadBudget.Lane = .payload,
        _ consume: (FolioleFramedSyncPayloadBudget.Loan?) throws -> T) throws -> T {
        guard let owner else { return try consume(nil) } // Explicit unmanaged pure codec/test constructor.
        let loan = try borrow(owner, direction: direction, lane: lane)
        defer { loan.release() }

        return try consume(loan)
    }
    static func borrow(_ owner: FolioleFramedSyncPayloadBudget, direction: FolioleFramedSyncPayloadBudget.Direction,
                       lane: FolioleFramedSyncPayloadBudget.Lane = .payload) throws -> FolioleFramedSyncPayloadBudget.Loan {
        guard DispatchQueue.getSpecific(key: key) == true else {
            throw FolioleFramedSyncValidationError("framed_sync_payload_worker_required")
        }
        let ready = DispatchSemaphore(value: 0), result = ResultBox()
        let cancellation = currentCancellation
        let requestID = owner.acquire(direction, lane: lane) { outcome in
            if case .success(let loan) = outcome, cancellation?.isCancelled == true {
                loan.release(); result.set(.failure(CancellationError()))
            } else { result.set(outcome) }
            ready.signal()
        }
        cancellation?.register(requestID) { owner.cancel(requestID) }
        ready.wait()
        cancellation?.remove(requestID)
        let loan = try result.get()
        do {
            guard cancellation?.isCancelled != true else { throw CancellationError() }
            try owner.requireActive(); return loan
        } catch { loan.release(); throw error }
    }

}

private final class ResultBox: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Result<FolioleFramedSyncPayloadBudget.Loan, Error>?
    func set(_ value: Result<FolioleFramedSyncPayloadBudget.Loan, Error>) { lock.lock(); self.value = value; lock.unlock() }
    func get() throws -> FolioleFramedSyncPayloadBudget.Loan {
        lock.lock(); defer { lock.unlock() }
        guard let value else { throw FolioleFramedSyncValidationError("framed_sync_payload_loan_missing") }
        return try value.get()
    }
}
