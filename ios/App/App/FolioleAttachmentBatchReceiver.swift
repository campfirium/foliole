import Foundation
import FolioleFramedSyncRuntime

/** File effects follow authenticated permissions; verification and publication are explicit shared decisions. */
final class FolioleAttachmentBatchReceiver: @unchecked Sendable {
    struct ResultEntry {
        let key: String
        let length: UInt64
        let offset: UInt64
        let state: String
        let blocks: Int
        let pending: Bool
        init(_ value: Foliole_Sync_V22_RequestAttachment, blocks: Int) {
            key = value.storageKey; length = value.byteLength; offset = value.offset
            state = value.state; pending = value.pending; self.blocks = blocks
        }
    }
    final class Completed {
        let key: String
        let length: UInt64
        var busy = false
        var verified = false
        var published = false
        init(key: String, length: UInt64) { self.key = key; self.length = length }
    }
    let storage: FolioleAttachmentBlockStorage
    let queue: FolioleAttachmentCompletionQueue
    private let lock = NSLock()
    private let entries: [String: FolioleAttachmentBatchAuthorization.Entry]
    private let check: () throws -> Void
    private var writer: FolioleAttachmentReceiveFile?
    private var reservation: FolioleAttachmentCompletionQueue.Reservation?
    private var completed = [Int: Completed]()
    private var results = [ResultEntry]()
    private var currentBlocks = 0
    private var ended = false
    private var waiting = false
    private(set) var bytes = 0
    private(set) var blocks = 0
    var waitingForCapacity: Bool { lock.lock(); defer { lock.unlock() }; return waiting }
    init(storage: FolioleAttachmentBlockStorage, queue: FolioleAttachmentCompletionQueue,
         entries: [FolioleAttachmentBatchAuthorization.Entry], check: @escaping () throws -> Void) {
        self.storage = storage; self.queue = queue; self.check = check
        self.entries = Dictionary(uniqueKeysWithValues: entries.map { ($0.key, $0) })
    }
    func accept(_ event: FolioleAttachmentBatchAuthorization.Event, _ value: Foliole_Sync_V22_RequestAttachment) throws {
        try check(); try queue.check()
        switch event {
        case .description: try open(value)
        case .block:
            guard let writer else { throw invalid("attachment_writer_missing") }
            try writer.append(offset: value.offset, data: value.data)
            currentBlocks += 1; blocks += 1; bytes += value.data.count
        case .fileEnd: try seal(value)
        case .rangeEnd: try close(); results.append(.init(value, blocks: currentBlocks))
        case .restart, .unavailable: results.append(.init(value, blocks: 0))
        case .batchEnd: ended = true
        }
    }
    private func open(_ value: Foliole_Sync_V22_RequestAttachment) throws {
        guard writer == nil, reservation == nil, let entry = entries[value.storageKey] else { throw invalid("attachment_writer_open") }
        lock.lock(); waiting = true; lock.unlock()
        do { reservation = try queue.reserve() }
        catch { lock.lock(); waiting = false; lock.unlock(); throw error }
        lock.lock(); waiting = false; lock.unlock()
        do {
            try check()
            writer = try storage.batchReceive(key: entry.key, offset: entry.start, partialLength: entry.partialLength) {
                try self.check(); try self.queue.check()
            }
            currentBlocks = 0
        } catch { try close(); throw error }
    }
    private func seal(_ value: Foliole_Sync_V22_RequestAttachment) throws {
        guard let writer, let reservation else { throw invalid("attachment_writer_missing") }
        lock.lock(); completed[reservation.sequence] = Completed(key: value.storageKey, length: value.byteLength); lock.unlock()
        do { try reservation.seal(key: value.storageKey, length: value.byteLength, closeWriter: writer.seal, ownership: writer.close) }
        catch { lock.lock(); completed.removeValue(forKey: reservation.sequence); lock.unlock(); throw error }
        self.writer = nil; self.reservation = nil
        results.append(.init(value, blocks: currentBlocks))
    }
    func result() throws -> [ResultEntry] {
        guard ended else { throw invalid("attachment_batch_incomplete") }; return results
    }
    func withFileOperation<T>(_ sequence: Int, execute: (Completed) throws -> T) throws -> T {
        let file: Completed
        lock.lock()
        do {
            try queue.requireClaimed(sequence)
            guard let value = completed[sequence], !value.busy else { throw invalid("attachment_completion_busy") }
            file = value; file.busy = true; lock.unlock()
        } catch { lock.unlock(); throw error }
        defer { lock.lock(); file.busy = false; lock.unlock() }
        return try execute(file)
    }
    func settle(_ sequence: Int, published: Bool) throws {
        lock.lock()
        if let file = completed[sequence] {
            guard !file.busy, !published || file.published else { lock.unlock(); throw invalid("attachment_settlement_invalid") }
            file.busy = true
        }
        lock.unlock()
        do {
            try queue.settle(sequence, published: published)
            lock.lock(); completed.removeValue(forKey: sequence); lock.unlock()
        } catch { lock.lock(); completed[sequence]?.busy = false; lock.unlock(); throw error }
    }
    func close() throws {
        defer { reservation?.close(); reservation = nil; writer = nil }
        try writer?.close()
    }
}

private func invalid(_ message: String) -> Error { FolioleFramedSyncValidationError(message) }
