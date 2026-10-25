import Foundation
import FolioleFramedSyncRuntime

final class FolioleAttachmentBatches {
    static let event = "attachmentBatchChanged"
    private static let lock = NSRecursiveLock()
    private static var owners = [ObjectIdentifier: FolioleAttachmentBatches]()
    private let owner: FolioleFramedSyncPayloadBudget
    private let capacity = FolioleAttachmentCompletionCapacity()
    private var operations = [String: FolioleAttachmentBatchOperation]()
    private init(owner: FolioleFramedSyncPayloadBudget) { self.owner = owner }
    static func open(owner: FolioleFramedSyncPayloadBudget, id: String, options: FolioleAttachmentBatchOptions,
                     wake: @escaping () -> Void) throws -> FolioleAttachmentBatchOperation {
        lock.lock(); defer { lock.unlock() }
        owners = owners.filter { key, value in key == ObjectIdentifier(owner) || !value.operations.values.allSatisfy(\.closed) }
        let batches = owners[ObjectIdentifier(owner)] ?? FolioleAttachmentBatches(owner: owner)
        owners[ObjectIdentifier(owner)] = batches
        guard batches.operations[id] == nil else { throw invalid("attachment_batch_duplicate") }
        batches.operations = batches.operations.filter { !$0.value.closed }
        guard batches.operations.count < 6 else { throw invalid("attachment_batch_capacity") }
        let operation = try FolioleAttachmentBatchOperation(id: id, owner: owner, storage: FolioleAttachmentBlockFiles.storage(owner),
            capacity: batches.capacity, requestID: options.requestID, entries: options.entries, context: options.context,
            initiatorEpoch: options.initiatorEpoch, wake: wake, cancelData: { requestHTTPTasks.cancel(id) })
        batches.operations[id] = operation; return operation
    }
    static func get(owner: FolioleFramedSyncPayloadBudget, id: String) throws -> FolioleAttachmentBatchOperation {
        lock.lock(); defer { lock.unlock() }
        guard let operation = owners[ObjectIdentifier(owner)]?.operations[id] else { throw invalid("attachment_batch_missing") }; return operation
    }
    static func dispose(owner: FolioleFramedSyncPayloadBudget, id: String) throws {
        lock.lock(); defer { lock.unlock() }
        guard try get(owner: owner, id: id).closed else { throw invalid("attachment_batch_running") }
        owners[ObjectIdentifier(owner)]?.operations.removeValue(forKey: id)
    }
    private static func invalid(_ message: String) -> Error { FolioleFramedSyncValidationError(message) }
}

extension FolioleAttachmentBatchOperation {
    func payload() -> [String: Any] {
        let value = snapshot()
        var payload: [String: Any] = ["library_key": owner.libraryKey, "generation_id": owner.generationID, "operation_id": id,
            "capacity": 4, "active_operations": value.active, "state": value.state, "files": value.files.map { fact in
                ["sequence": fact.sequence, "storage_key": fact.key, "byte_length": Int(fact.length), "state": fact.claimed ? "claimed" : "sealed"]
            }]
        if let entries = value.entries {
            payload["result"] = ["bytes": value.bytes, "blocks": value.blocks, "entries": entries.map { entry in
                ["storage_key": entry.key, "byte_length": Int(entry.length), "offset": Int(entry.offset),
                 "state": entry.state, "blocks": entry.blocks, "pending": entry.pending]
            }]
        } else if !value.error.isEmpty { payload["error"] = value.error }
        if !value.outcome.isEmpty { payload["outcome"] = value.outcome }; return payload
    }
}
