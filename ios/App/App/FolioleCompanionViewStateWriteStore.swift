import CryptoKit
import Foundation
import SQLite3

final class FolioleCompanionViewStateWriteStore {
    private let contract: FolioleCompanionViewStateWriteContract
    private var database: OpaquePointer?

    init(databaseURL: URL, contract: FolioleCompanionViewStateWriteContract) throws {
        self.contract = contract
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(databaseURL.path, &database, flags, nil) == SQLITE_OK else {
            throw error("open failed")
        }
        sqlite3_busy_timeout(database, 5_000)
    }

    deinit { if let database { sqlite3_close(database) } }

    func saveActiveNode(_ rawNodeId: String?) throws -> [String: Any] {
        let nodeId = normalized(rawNodeId)
        let deviceId = try canonicalDeviceId()
        let payload: [String: Any] = [contract.activeNodePayloadKey: nodeId ?? NSNull()]
        let result = try writeResult(deviceId: deviceId, key: contract.activeNodeKey, payload: payload)
        try transaction {
            try execute(contract.activeNodeSQL, bindings: [
                .text(contract.workspaceMetaKey), .text(nodeId ?? ""), .text(Self.timestamp())
            ])
        }
        return result
    }

    func saveNodeViewState(nodeId rawNodeId: String, scrollTop: Int) throws -> [String: Any] {
        guard let nodeId = normalized(rawNodeId) else { throw error("node_id is required") }
        let deviceId = try canonicalDeviceId()
        let scrollTop = max(0, scrollTop)
        let payload: [String: Any] = [
            contract.nodeIdPayloadKey: nodeId,
            contract.scrollTopPayloadKey: scrollTop,
            contract.selectionFromPayloadKey: NSNull(),
            contract.selectionToPayloadKey: NSNull(),
            contract.sourcePayloadKey: contract.localSource
        ]
        let result = try writeResult(deviceId: deviceId, key: contract.nodeKeyPrefix + nodeId, payload: payload)
        try transaction {
            try execute(contract.nodeStateSQL, bindings: [
                .text(nodeId), .text(deviceId), .integer(scrollTop), .null, .null,
                .text(contract.localSource), .text(Self.timestamp())
            ])
        }
        return result
    }

    private func canonicalDeviceId() throws -> String {
        let rows = try textRows("SELECT value FROM companion_meta WHERE key = ?", bindings: [.text("device_id")])
        guard rows.count == 1, let deviceId = normalized(rows[0]) else {
            throw error("companion device identity is unavailable")
        }
        return deviceId
    }

    private func writeResult(deviceId: String, key: String, payload: [String: Any]) throws -> [String: Any] {
        let parts = [contract.scope, contract.platform, contract.formFactor, deviceId, key]
        let objectId = parts.joined(separator: contract.objectIdDelimiter)
        var canonical: [String: Any] = [
            try contractValue("deviceId", contract.canonicalKeys): deviceId,
            try contractValue("formFactor", contract.canonicalKeys): contract.formFactor,
            try contractValue("key", contract.canonicalKeys): key,
            try contractValue("platform", contract.canonicalKeys): contract.platform,
            try contractValue("scope", contract.canonicalKeys): contract.scope
        ]
        for (payloadKey, value) in payload where !contract.hashIgnoredPayloadKeys.contains(payloadKey) {
            canonical[payloadKey] = value
        }
        return [
            try contractValue("objectId", contract.resultKeys): objectId,
            try contractValue("contentHash", contract.resultKeys): try Self.contentHash(canonical)
        ]
    }

    private func transaction(_ operation: () throws -> Void) throws {
        try execute("BEGIN IMMEDIATE")
        do {
            try operation()
            try execute("COMMIT")
        } catch {
            _ = try? execute("ROLLBACK")
            throw error
        }
    }

    private func textRows(_ sql: String, bindings: [Binding]) throws -> [String] {
        let statement = try prepare(sql, bindings: bindings)
        defer { sqlite3_finalize(statement) }
        var result: [String] = []
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { return result }
            guard status == SQLITE_ROW else { throw error(message()) }
            result.append(sqlite3_column_text(statement, 0).map { String(cString: $0) } ?? "")
        }
    }

    @discardableResult
    private func execute(_ sql: String, bindings: [Binding] = []) throws -> Int {
        let statement = try prepare(sql, bindings: bindings)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw error(message()) }
        return Int(sqlite3_changes(database))
    }

    private func prepare(_ sql: String, bindings: [Binding]) throws -> OpaquePointer {
        guard let database else { throw error("database closed") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw error(message())
        }
        for (offset, binding) in bindings.enumerated() { try binding.bind(statement, Int32(offset + 1)) }
        return statement
    }

    private func contractValue(_ key: String, _ values: [String: String]) throws -> String {
        guard let value = values[key] else { throw error("missing contract key \(key)") }
        return value
    }

    private func normalized(_ value: String?) -> String? {
        let value = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return value?.isEmpty == false ? value : nil
    }

    private func message() -> String {
        database.map { String(cString: sqlite3_errmsg($0)) } ?? "SQLite error"
    }

    private func error(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionViewStateWriteStore", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private static func contentHash(_ value: [String: Any]) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }

    private enum Binding {
        case integer(Int)
        case null
        case text(String)

        func bind(_ statement: OpaquePointer, _ index: Int32) throws {
            let status: Int32
            switch self {
            case .integer(let value): status = sqlite3_bind_int64(statement, index, sqlite3_int64(value))
            case .null: status = sqlite3_bind_null(statement, index)
            case .text(let value): status = sqlite3_bind_text(statement, index, value, -1, Self.transient)
            }
            guard status == SQLITE_OK else {
                throw NSError(domain: "FolioleCompanionViewStateWriteStore", code: 2)
            }
        }

        private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    }
}
