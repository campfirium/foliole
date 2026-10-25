import Foundation
import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class AttachmentBatchFileFixture {
    let files: AttachmentBlockStorageFixture
    let capacity: FolioleAttachmentCompletionCapacity
    let queue: FolioleAttachmentCompletionQueue
    let receiver: FolioleAttachmentBatchReceiver
    let finalizer: FolioleAttachmentBatchFinalizer
    let entries: [FolioleAttachmentBatchAuthorization.Entry]
    let contents: [Data]
    var messages: [Foliole_Sync_V22_RequestAttachment]
    init(count: Int, now: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
         changed: @escaping () -> Void = {}, progress: @escaping () -> Void = {}) throws {
        files = try AttachmentBlockStorageFixture()
        capacity = .init(now: now)
        queue = .init(capacity: capacity, changed: changed)
        contents = (0..<count).map { index in var data = Data(count: 131072); data[0] = UInt8(index); return data }
        entries = try contents.map { try .init(key: AttachmentBlockStorageFixture.hash($0) + ".png", start: 0, knownLength: 0, partialLength: 0) }
        messages = zip(entries, contents).flatMap { entry, data in
            [AttachmentBatchWireFixture.value(entry.key, "description", UInt64(data.count)),
             AttachmentBatchWireFixture.value(entry.key, "block", UInt64(data.count), 0, data),
             AttachmentBatchWireFixture.value(entry.key, "file_end", UInt64(data.count), UInt64(data.count))]
        } + [AttachmentBatchWireFixture.value("", "batch_end", 0, UInt64(count * 131072))]
        let queue = self.queue, capacity = self.capacity
        receiver = .init(storage: files.storage, queue: queue, entries: entries, check: queue.check)
        finalizer = .init(receiver: receiver, check: queue.check, progress: { capacity.touchHash(); progress() }, commit: { action in
            try queue.check(); try action()
        })
    }
    func decoder(consume: ((FolioleAttachmentBatchAuthorization.Event, Foliole_Sync_V22_RequestAttachment) throws -> Void)? = nil) throws -> FolioleRequestSyncAttachmentBatchDecoder {
        try .init(groupKey: AttachmentBatchWireFixture.groupKey, context: AttachmentBatchWireFixture.context(),
            permission: .init(requestID: Data(count: 16), entries: entries), check: queue.check, consume: consume ?? receiver.accept)
    }
    func finish(_ fact: FolioleAttachmentCompletionQueue.FileFact) throws {
        try queue.claim([fact.sequence])
        guard try finalizer.verify(fact.sequence) else { throw FolioleFramedSyncValidationError("test_hash_mismatch") }
        try finalizer.publish(fact.sequence); try receiver.settle(fact.sequence, published: true)
    }
    func close() {
        try? receiver.close(); queue.stop(); try? queue.releaseAfterExit(includeClaimed: true); files.close()
    }
}
