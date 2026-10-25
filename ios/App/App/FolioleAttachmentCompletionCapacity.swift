import Foundation
import FolioleFramedSyncRuntime

final class FolioleAttachmentCompletionCapacity: @unchecked Sendable {
    final class Token {
        private let lock = NSLock()
        private var release: (() -> Void)?
        init(_ release: @escaping () -> Void) { self.release = release }
        func close() {
            lock.lock(); let action = release; release = nil; lock.unlock(); action?()
        }
        deinit { close() }
    }
    private let condition = NSCondition()
    private var count = 0
    private var progress: TimeInterval
    let now: () -> TimeInterval
    init(now: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.now = now; progress = now()
    }
    var used: Int { condition.lock(); defer { condition.unlock() }; return count }
    var hashProgress: TimeInterval { condition.lock(); defer { condition.unlock() }; return progress }
    func touchHash() { condition.lock(); progress = now(); condition.unlock() }
    func wake() { condition.lock(); condition.broadcast(); condition.unlock() }
    func reserve(check: () throws -> Void) throws -> Token {
        condition.lock(); defer { condition.unlock() }
        while count == 4 { try check(); condition.wait() }
        try check(); count += 1
        return Token {
            self.condition.lock(); self.count -= 1; self.condition.broadcast(); self.condition.unlock()
        }
    }
}
