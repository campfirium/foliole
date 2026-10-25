import Foundation
import FolioleFramedSyncRuntime

/** Retained metadata is the fact; an event only wakes its consumer. */
final class FolioleAttachmentCompletionQueue: @unchecked Sendable {
    static let handoffSeconds: TimeInterval = 60
    struct FileFact {
        let sequence: Int
        let key: String
        let length: UInt64
        var claimed = false
    }
    private struct Record {
        var fact: FileFact
        let sealedAt: TimeInterval
        let release: () throws -> Void
    }
    final class Reservation {
        let sequence: Int
        private let queue: FolioleAttachmentCompletionQueue
        private var token: FolioleAttachmentCompletionCapacity.Token?
        init(sequence: Int, queue: FolioleAttachmentCompletionQueue, token: FolioleAttachmentCompletionCapacity.Token) {
            self.sequence = sequence; self.queue = queue; self.token = token
        }
        func seal(key: String, length: UInt64, closeWriter: () throws -> Void, ownership: @escaping () throws -> Void) throws {
            try closeWriter()
            queue.lock.lock()
            do {
                try queue.check()
                guard let token else { throw invalid("attachment_reservation_closed") }
                queue.records[sequence] = Record(fact: .init(sequence: sequence, key: key, length: length), sealedAt: queue.capacity.now()) {
                    defer { token.close() }; try ownership()
                }
                self.token = nil; queue.lock.unlock()
            } catch { queue.lock.unlock(); throw error }
            queue.changed()
        }
        func close() {
            queue.lock.lock(); let token = self.token; self.token = nil; queue.lock.unlock(); token?.close()
        }
        deinit { close() }
    }
    private let lock = NSLock()
    private let cancellation = FolioleFramedSyncPayloadCancellation()
    let capacity: FolioleAttachmentCompletionCapacity
    private let changed: () -> Void
    private var nextSequence = 0
    private var records = [Int: Record]()
    private var settled = [Int: Bool]()
    init(capacity: FolioleAttachmentCompletionCapacity, changed: @escaping () -> Void) {
        self.capacity = capacity; self.changed = changed
    }
    func check() throws { if cancellation.isCancelled { throw invalid("attachment_batch_stopped") } }
    func reserve() throws -> Reservation {
        let token = try capacity.reserve(check: check)
        lock.lock(); defer { lock.unlock() }
        do {
            try check()
            guard nextSequence < 256 else { throw invalid("attachment_batch_entry_limit") }
            nextSequence += 1; return Reservation(sequence: nextSequence, queue: self, token: token)
        } catch { token.close(); throw error }
    }
    func read() -> [FileFact] {
        lock.lock(); defer { lock.unlock() }
        return records.values.map(\.fact).sorted { $0.sequence < $1.sequence }
    }
    func claim(_ sequences: [Int]) throws {
        lock.lock()
        do {
            try check()
            guard sequences.allSatisfy({ records[$0] != nil || settled[$0] != nil }) else { throw invalid("attachment_completion_missing") }
            var notify = false
            for sequence in sequences where records[sequence] != nil && records[sequence]?.fact.claimed == false {
                records[sequence]?.fact.claimed = true; notify = true
            }
            lock.unlock(); if notify { changed() }
        } catch { lock.unlock(); throw error }
    }
    func settle(_ sequence: Int, published: Bool) throws {
        lock.lock()
        if let previous = settled[sequence] {
            lock.unlock()
            guard previous == published else { throw invalid("attachment_settlement_changed") }; return
        }
        guard let record = records[sequence], record.fact.claimed else { lock.unlock(); throw invalid("attachment_completion_missing") }
        records.removeValue(forKey: sequence); settled[sequence] = published; lock.unlock()
        try record.release(); changed()
    }
    func requireClaimed(_ sequence: Int) throws {
        try check(); lock.lock(); defer { lock.unlock() }
        guard records[sequence]?.fact.claimed == true else { throw invalid("attachment_completion_missing") }
    }
    var nextDeadline: TimeInterval {
        lock.lock(); defer { lock.unlock() }
        return records.values.map { record in
            (record.fact.claimed ? max(record.sealedAt, capacity.hashProgress) : record.sealedAt) + Self.handoffSeconds
        }.min() ?? .infinity
    }
    func expire() -> Bool {
        guard !cancellation.isCancelled, capacity.now() >= nextDeadline else { return false }
        stop(); return true
    }
    func stop() { cancellation.cancel(); capacity.wake(); changed() }
    func releaseAfterExit(includeClaimed: Bool) throws {
        guard cancellation.isCancelled else { throw invalid("attachment_batch_running") }
        lock.lock()
        let abandoned = records.values.filter { includeClaimed || !$0.fact.claimed }
        for record in abandoned { records.removeValue(forKey: record.fact.sequence); settled[record.fact.sequence] = false }
        lock.unlock()
        var failure: Error?
        for record in abandoned { do { try record.release() } catch { failure = error } }
        if let failure { throw failure }
    }
}

private func invalid(_ message: String) -> Error { FolioleFramedSyncValidationError(message) }
