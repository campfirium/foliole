import Foundation

final class FolioleCompanionSyncGroupDataBridge: FolioleCompanionSyncGroupDataRequesting {
    private let lock = NSLock()
    private struct Pending { let semaphore: DispatchSemaphore; var result: Result<[String: Any], Error>?; var cancelled = false; let owner: FolioleFramedSyncPayloadBudget? }
    private var pending: [String: Pending] = [:]
    private let dispatch: ([String: Any]) -> Void

    init(dispatch: @escaping ([String: Any]) -> Void) { self.dispatch = dispatch }

    func request(_ operation: String, _ payload: [String: Any]) throws -> [String: Any] {
        try request(operation, payload, owner: nil)
    }

    func request(_ operation: String, _ payload: [String: Any], documentOwner: FolioleFramedSyncPayloadBudget) throws -> [String: Any] {
        try documentOwner.requireActive()
        return try request(operation, payload, owner: documentOwner)
    }

    private func request(_ operation: String, _ payload: [String: Any], owner: FolioleFramedSyncPayloadBudget?) throws -> [String: Any] {
        let requestId = UUID().uuidString.lowercased()
        let semaphore = DispatchSemaphore(value: 0)
        lock.withLock { pending[requestId] = Pending(semaphore: semaphore, result: nil, owner: owner) }
        dispatch(["operation": operation, "payload": payload, "request_id": requestId])
        guard semaphore.wait(timeout: .now() + 60) == .success else {
            lock.withLock { pending.removeValue(forKey: requestId) }
            throw invalid("sync_group_data_request_timed_out")
        }
        let result = lock.withLock { pending.removeValue(forKey: requestId)?.result }
        guard let result else { throw invalid("sync_group_data_response_missing") }
        return try result.get()
    }

    func shouldDispatch(_ event: [String: Any]) -> Bool {
        guard let id = event["request_id"] as? String else { return false }
        return lock.withLock {
            guard let entry = pending[id], !entry.cancelled, entry.result == nil else { return false }
            if let owner = entry.owner, (try? owner.requireActive()) == nil {
                var cancelled = entry
                cancelled.cancelled = true
                cancelled.result = .failure(invalid("sync_group_document_invalidated"))
                pending[id] = cancelled
                entry.semaphore.signal()
                return false
            }
            return true
        }
    }

    func resolve(_ response: [String: Any]) throws {
        guard let requestId = response["request_id"] as? String,
              let entry = lock.withLock({ pending[requestId] }) else {
            throw invalid("sync_group_data_request_not_found")
        }
        let result: Result<[String: Any], Error>
        if let message = response["error"] as? String, !message.isEmpty {
            result = .failure(invalid(message))
        } else { result = .success(response["result"] as? [String: Any] ?? [:]) }
        try lock.withLock {
            guard var current = pending[requestId], !current.cancelled else { throw invalid("sync_group_data_request_not_found") }
            current.result = result; pending[requestId] = current
        }
        entry.semaphore.signal()
    }

    func cancelPending(documentOwner: FolioleFramedSyncPayloadBudget) {
        let cancelled = lock.withLock {
            let matches = pending.filter { $0.value.owner === documentOwner }
            for (id, var entry) in matches {
                entry.cancelled = true; entry.result = .failure(invalid("sync_group_document_invalidated")); pending[id] = entry
            }
            return matches.values.map(\.semaphore)
        }
        for semaphore in cancelled { semaphore.signal() }
    }

    private func invalid(_ detail: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncGroupData", code: 1,
                userInfo: [NSLocalizedDescriptionKey: detail])
    }
}
