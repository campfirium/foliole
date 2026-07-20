import CryptoKit
import Foundation
import SQLite3

final class FolioleCompanionSettingWriteStore {
    private let contract: FolioleCompanionSettingWriteContract
    private var database: OpaquePointer?

    init(databaseURL: URL, contract: FolioleCompanionSettingWriteContract) throws {
        self.contract = contract
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(databaseURL.path, &database, flags, nil) == SQLITE_OK else {
            throw error("open failed")
        }
        sqlite3_busy_timeout(database, 5_000)
    }

    deinit { if let database { sqlite3_close(database) } }

    func save(
        key rawKey: String,
        scope: String,
        platform: String,
        formFactor: String,
        deviceId: String,
        valueJson: String
    ) throws -> [String: Any] {
        guard let key = normalized(rawKey) else { throw error("key is required") }
        let parts = [scope, platform, formFactor, deviceId, key]
        let objectId = parts.joined(separator: contract.objectIdDelimiter)
        let payload = try canonicalPayload(
            key: key, scope: scope, platform: platform,
            formFactor: formFactor, deviceId: deviceId, valueJson: valueJson
        )
        let contentHash = try Self.contentHash(payload)
        try transaction {
            let modifier = try canonicalDeviceId()
            let existing = try existingState(objectId)
            let nextSequence = try nextStateSequence()
            let timestamp = Self.timestamp()
            try execute(contract.settingUpsertSQL, bindings: [
                .text(key), .text(scope), .text(platform), .text(formFactor),
                .text(deviceId), .text(valueJson), .text(contentHash), .text(timestamp)
            ])
            try execute(contract.stateUpsertSQL, bindings: [
                .text(contract.objectType), .text(objectId), .integer(nextSequence), .null,
                .text(contentHash), existing.baseHash.map(Binding.text) ?? .null,
                .text(modifier), .text(timestamp), .null, .integer(1)
            ])
            if try tableExists(contract.pushAckTable) {
                try execute(contract.pushAckDeleteSQL, bindings: [.text(contract.objectType), .text(objectId)])
            }
        }
        return [
            try contract.key("objectId", in: contract.resultKeys): objectId,
            try contract.key("contentHash", in: contract.resultKeys): contentHash
        ]
    }

    private func canonicalPayload(
        key: String, scope: String, platform: String,
        formFactor: String, deviceId: String, valueJson: String
    ) throws -> [String: Any] {
        [
            try contract.key("deviceId", in: contract.canonicalKeys): deviceId,
            try contract.key("formFactor", in: contract.canonicalKeys): formFactor,
            try contract.key("key", in: contract.canonicalKeys): key,
            try contract.key("platform", in: contract.canonicalKeys): platform,
            try contract.key("scope", in: contract.canonicalKeys): scope,
            try contract.key("valueJson", in: contract.payloadKeys): valueJson
        ]
    }

    private func canonicalDeviceId() throws -> String {
        let row = try queryRow(contract.metaValueSQL, bindings: [.text("device_id")])
        guard let value = row?.first ?? nil, let deviceId = normalized(value) else {
            throw error("companion device identity is unavailable")
        }
        return deviceId
    }

    private func existingState(_ objectId: String) throws -> ExistingState {
        guard let row = try queryRow(
            contract.existingStateSQL,
            bindings: [.text(contract.objectType), .text(objectId)]
        ) else { return ExistingState(baseHash: nil) }
        let contentHash = row[safe: 0] ?? nil
        let savedBaseHash = row[safe: 1] ?? nil
        let dirty = Int((row[safe: 2] ?? nil) ?? "0") == 1
        return ExistingState(baseHash: dirty ? (savedBaseHash ?? contentHash) : contentHash)
    }

    private func nextStateSequence() throws -> Int {
        guard let value = try queryRow(contract.nextStateSeqSQL)?.first ?? nil,
              let sequence = Int(value) else { throw error("next state sequence is unavailable") }
        return sequence
    }

    private func tableExists(_ table: String) throws -> Bool {
        try queryRow(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            bindings: [.text(table)]
        ) != nil
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

    private func queryRow(_ sql: String, bindings: [Binding] = []) throws -> [String?]? {
        let statement = try prepare(sql, bindings)
        defer { sqlite3_finalize(statement) }
        let status = sqlite3_step(statement)
        if status == SQLITE_DONE { return nil }
        guard status == SQLITE_ROW else { throw error(message()) }
        return (0..<sqlite3_column_count(statement)).map { index in
            sqlite3_column_text(statement, index).map { String(cString: $0) }
        }
    }

    private func execute(_ sql: String, bindings: [Binding] = []) throws {
        let statement = try prepare(sql, bindings)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw error(message()) }
    }

    private func prepare(_ sql: String, _ bindings: [Binding]) throws -> OpaquePointer {
        guard let database else { throw error("database closed") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw error(message())
        }
        for (offset, binding) in bindings.enumerated() { try binding.bind(statement, Int32(offset + 1)) }
        return statement
    }

    private func normalized(_ value: String?) -> String? {
        let value = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return value?.isEmpty == false ? value : nil
    }

    private func message() -> String {
        database.map { String(cString: sqlite3_errmsg($0)) } ?? "SQLite error"
    }

    private func error(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSettingWriteStore", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }

    private static func contentHash(_ value: [String: Any]) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private static func timestamp() -> String { ISO8601DateFormatter().string(from: Date()) }

    private struct ExistingState { let baseHash: String? }

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
            guard status == SQLITE_OK else { throw NSError(domain: "FolioleSettingBinding", code: 1) }
        }

        private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    }
}

private extension Array {
    subscript(safe index: Index) -> Element? { indices.contains(index) ? self[index] : nil }
}
