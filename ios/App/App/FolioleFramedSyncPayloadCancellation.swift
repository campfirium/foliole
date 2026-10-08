import Foundation

final class FolioleFramedSyncPayloadCancellation: @unchecked Sendable {
    private let lock = NSLock()
    private var cancelled = false
    private var pending = [UUID: () -> Void]()
    var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return cancelled }

    func register(_ id: UUID, cancel: @escaping () -> Void) {
        lock.lock()
        let invoke = cancelled
        if !invoke { pending[id] = cancel }
        lock.unlock()
        if invoke { cancel() }
    }

    func remove(_ id: UUID) { lock.lock(); pending.removeValue(forKey: id); lock.unlock() }

    func cancel() {
        lock.lock(); cancelled = true
        let actions = Array(pending.values); pending.removeAll(); lock.unlock()
        for action in actions { action() }
    }
}
