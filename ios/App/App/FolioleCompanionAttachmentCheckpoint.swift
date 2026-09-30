import Foundation

// File durability precedes this callback; SQLite remains owned by the shared writer.
final class FolioleCompanionAttachmentCheckpoint {
    private let request: (String, [String: Any]) throws -> [String: Any]
    private let identity: [String: Any]

    init(databasePath: String, partialURL: URL, hash: String,
         request: @escaping (String, [String: Any]) throws -> [String: Any]) throws {
        self.request = request
        identity = ["database_path": databasePath, "temporary_path": partialURL.path, "content_hash": hash]
    }

    func load(_ total: Int) throws -> Int {
        guard let confirmed = try send("load", total, 0)["confirmed_bytes"] as? Int else {
            throw NSError(domain: "FolioleAttachmentCheckpoint", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "attachment_checkpoint_response_invalid"])
        }
        return confirmed
    }

    func save(_ total: Int, _ confirmed: Int) throws { _ = try send("save", total, confirmed) }
    func clear() throws { _ = try send("clear", 0, 0) }

    private func send(_ action: String, _ total: Int, _ confirmed: Int) throws -> [String: Any] {
        var payload = identity
        payload["action"] = action
        payload["total_bytes"] = total
        payload["confirmed_bytes"] = confirmed
        return try request("attachment_checkpoint", payload)
    }
}
