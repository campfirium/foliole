import Foundation
import FolioleFramedSyncRuntime

final class FolioleAttachmentBatchOperation: @unchecked Sendable {
    private static let deadlines = DispatchQueue(label: "com.campfirium.foliole.attachment-handoff-deadline")
    let id: String
    let owner: FolioleFramedSyncPayloadBudget
    let context: FolioleFramedSyncSessionContext
    let initiatorEpoch: String
    let permission: FolioleAttachmentBatchAuthorization
    private(set) var queue: FolioleAttachmentCompletionQueue!
    private(set) var receiver: FolioleAttachmentBatchReceiver!
    private var finalizer: FolioleAttachmentBatchFinalizer!
    private let capacity: FolioleAttachmentCompletionCapacity
    private let lock = NSLock()
    private let cancellation = FolioleFramedSyncPayloadCancellation()
    private let wake: () -> Void
    private let cancelData: () -> Void
    private var state = "prepared"
    private var failure = ""
    private var active = 0
    private var stopped = false
    private var dataExited = false
    private var released = false
    private var releasing = false
    private var ready = false
    private var cancellationRequested = false
    private var lifetime: UUID?
    private var dataProgress: TimeInterval
    private var deadline: DispatchWorkItem?
    private var waiters = [(Result<Void, Error>) -> Void]()
    private var exitFailure: Error?

    init(id: String, owner: FolioleFramedSyncPayloadBudget, storage: FolioleAttachmentBlockStorage,
         capacity: FolioleAttachmentCompletionCapacity, requestID: Data, entries: [FolioleAttachmentBatchAuthorization.Entry],
         context: FolioleFramedSyncSessionContext, initiatorEpoch: String, wake: @escaping () -> Void,
         cancelData: @escaping () -> Void, hashProgress: @escaping () -> Void = {}) throws {
        self.id = id; self.owner = owner; self.capacity = capacity; self.context = context; self.initiatorEpoch = initiatorEpoch
        self.wake = wake; self.cancelData = cancelData; dataProgress = capacity.now()
        permission = try .init(requestID: requestID, entries: entries)
        queue = .init(capacity: capacity) { [weak self] in self?.changed() }
        receiver = .init(storage: storage, queue: queue, entries: entries) { [weak self] in
            guard let self else { throw CancellationError() }; try self.check(); self.progress()
        }
        finalizer = .init(receiver: receiver, check: { [weak self] in
            guard let self else { throw CancellationError() }; try self.check()
        }, progress: { capacity.touchHash(); hashProgress() }, commit: { [weak self] action in
            guard let self else { throw CancellationError() }; try self.commit(action)
        })
        let operation = try owner.beginOperation { [weak self] in self?.cancelRequested() }
        lock.lock(); lifetime = operation; ready = true; let cancel = cancellationRequested; lock.unlock()
        if cancel { stop() } else { schedule() }
    }
    private func cancelRequested() {
        lock.lock(); cancellationRequested = true; let ready = self.ready; lock.unlock()
        if ready { stop() }
    }
    func check() throws {
        guard !cancellation.isCancelled else { throw CancellationError() }; try owner.requireActive()
    }
    private func commit(_ publish: () throws -> Void) throws {
        lock.lock(); defer { lock.unlock() }
        guard !stopped else { throw CancellationError() }; try owner.withPublication(publish)
    }
    func start() throws {
        try check(); lock.lock(); defer { lock.unlock() }
        guard state == "prepared", !stopped else { throw invalid("attachment_batch_already_started") }
        state = "receiving"; active += 1; dataProgress = capacity.now()
    }
    func progress() { lock.lock(); dataProgress = capacity.now(); lock.unlock() }
    func finishData(_ error: Error?) throws {
        var failure = error
        do { try receiver.close() } catch { if failure == nil { failure = error } }
        if failure == nil { do { _ = try receiver.result() } catch { failure = error } }
        lock.lock(); active -= 1; dataExited = true
        if stopped { state = "stopped" }
        else if let failure { state = "data_failed"; self.failure = String(describing: failure) }
        else { state = "data_complete" }
        lock.unlock(); changed()
        if let failure { throw failure }
    }
    func stop() {
        lock.lock()
        guard !stopped, !released else { lock.unlock(); return }
        stopped = true; failure = "attachment_batch_stopped"
        if state == "prepared" { dataExited = true }
        state = "stopped"; lock.unlock()
        cancellation.cancel(); queue.stop(); cancelData(); changed()
    }
    func verify(_ sequence: Int) throws -> Bool {
        try begin(); defer { finish() }; return try finalizer.verify(sequence)
    }
    func finalize(_ action: String, _ sequence: Int) throws {
        try begin(); defer { finish() }
        if action == "publish" { try finalizer.publish(sequence) } else { try finalizer.discard(sequence) }
    }
    private func begin() throws {
        try check(); lock.lock(); defer { lock.unlock() }
        guard !stopped else { throw CancellationError() }; active += 1
    }
    private func finish() { lock.lock(); active -= 1; lock.unlock(); changed() }
    var closed: Bool { lock.lock(); defer { lock.unlock() }; return released }
    func onExit(_ complete: @escaping (Result<Void, Error>) -> Void) {
        lock.lock()
        if released { let error = exitFailure; lock.unlock(); complete(error.map(Result.failure) ?? .success(())); return }
        guard waiters.count < 4 else { lock.unlock(); complete(.failure(invalid("attachment_exit_waiter_limit"))); return }
        waiters.append(complete); lock.unlock()
    }
    func changed() {
        lock.lock()
        let release = !released && !releasing && dataExited && active == 0 && (stopped || queue.read().isEmpty)
        if release { releasing = true }
        lock.unlock()
        if release {
            var error: Error?
            if stopped { do { try queue.releaseAfterExit(includeClaimed: true) } catch let failure { error = failure } }
            lock.lock(); let lifetime = self.lifetime; self.lifetime = nil; lock.unlock()
            if let lifetime { owner.finishOperation(lifetime) }
            lock.lock(); exitFailure = error; released = true; releasing = false
            let callbacks = waiters; waiters.removeAll(); lock.unlock()
            for complete in callbacks { complete(error.map(Result.failure) ?? .success(())) }
        }
        schedule(); wake()
    }
    private var dataDeadline: TimeInterval {
        (receiver.waitingForCapacity ? max(dataProgress, capacity.hashProgress) : dataProgress) + FolioleAttachmentCompletionQueue.handoffSeconds
    }
    private func schedule() {
        lock.lock(); defer { lock.unlock() }
        deadline?.cancel()
        guard !released, !releasing else { return }
        let next = min(queue.nextDeadline, dataExited ? .infinity : dataDeadline)
        guard next.isFinite else { return }
        let item = DispatchWorkItem { [weak self] in self?.expire() }; deadline = item
        Self.deadlines.asyncAfter(deadline: .now() + max(0.001, next - capacity.now()), execute: item)
    }
    func expire() {
        lock.lock(); let expired = !dataExited && capacity.now() >= dataDeadline; lock.unlock()
        if queue.expire() || expired { stop() } else { schedule() }
    }
    struct Snapshot {
        let state: String
        let outcome: String
        let error: String
        let files: [FolioleAttachmentCompletionQueue.FileFact]
        let entries: [FolioleAttachmentBatchReceiver.ResultEntry]?
        let active: Int
        let bytes: Int
        let blocks: Int
    }
    func snapshot() -> Snapshot {
        lock.lock(); defer { lock.unlock() }
        return .init(state: released ? "closed" : state,
            outcome: released ? state == "data_complete" ? "complete" : stopped ? "stopped" : "failed" : "",
            error: failure, files: queue.read(), entries: state == "data_complete" ? try? receiver.result() : nil,
            active: active, bytes: receiver.bytes, blocks: receiver.blocks)
    }
    private func invalid(_ message: String) -> Error { FolioleFramedSyncValidationError(message) }
}
