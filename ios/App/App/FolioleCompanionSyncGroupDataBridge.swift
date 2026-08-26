import Capacitor
import Foundation

final class FolioleCompanionSyncGroupDataBridge: FolioleCompanionSyncGroupDataRequesting {
    private let lock = NSLock()
    private var pending: [String: (DispatchSemaphore, Result<[String: Any], Error>?)] = [:]
    private let dispatch: ([String: Any]) -> Void

    init(dispatch: @escaping ([String: Any]) -> Void) { self.dispatch = dispatch }

    func request(_ operation: String, _ payload: [String: Any]) throws -> [String: Any] {
        let requestId = UUID().uuidString.lowercased()
        let semaphore = DispatchSemaphore(value: 0)
        lock.withLock { pending[requestId] = (semaphore, nil) }
        dispatch(["operation": operation, "payload": payload, "request_id": requestId])
        guard semaphore.wait(timeout: .now() + 60) == .success else {
            lock.withLock { pending.removeValue(forKey: requestId) }
            throw invalid("sync_group_data_request_timed_out")
        }
        let result = lock.withLock { pending.removeValue(forKey: requestId)?.1 }
        guard let result else { throw invalid("sync_group_data_response_missing") }
        return try result.get()
    }

    func resolve(_ response: JSObject) throws {
        guard let requestId = response["request_id"] as? String,
              let entry = lock.withLock({ pending[requestId] }) else {
            throw invalid("sync_group_data_request_not_found")
        }
        let result: Result<[String: Any], Error>
        if let message = response["error"] as? String, !message.isEmpty {
            result = .failure(invalid(message))
        } else { result = .success(response["result"] as? [String: Any] ?? [:]) }
        lock.withLock { pending[requestId] = (entry.0, result) }
        entry.0.signal()
    }

    private func invalid(_ detail: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncGroupData", code: 1,
                userInfo: [NSLocalizedDescriptionKey: detail])
    }
}
