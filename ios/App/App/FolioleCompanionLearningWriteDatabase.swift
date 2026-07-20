import CryptoKit
import Foundation
import SQLite3

protocol FolioleCompanionLearningSyncStateContract {
    var existingStateSQL: String { get }
    var metaValueSQL: String { get }
    var nextStateSeqSQL: String { get }
    var objectType: String { get }
    var pushAckDeleteSQL: String { get }
    var pushAckTable: String { get }
    var stateUpsertSQL: String { get }
}

final class FolioleCompanionLearningWriteDatabase {
    private var database: OpaquePointer?

    init(url: URL) throws {
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(url.path, &database, flags, nil) == SQLITE_OK else {
            throw error("open failed")
        }
        sqlite3_busy_timeout(database, 5_000)
    }

    deinit { if let database { sqlite3_close(database) } }

    func transaction(_ operation: () throws -> Void) throws {
        try execute("BEGIN IMMEDIATE")
        do { try operation(); try execute("COMMIT") } catch {
            _ = try? execute("ROLLBACK")
            throw error
        }
    }

    func canonicalDeviceId(_ contract: FolioleCompanionLearningSyncStateContract) throws -> String {
        let row = try queryRow(contract.metaValueSQL, bindings: [.text("device_id")])
        guard let value = row?.first ?? nil, let deviceId = Self.normalized(value) else {
            throw error("companion device identity is unavailable")
        }
        return deviceId
    }

    func writeDirtyState(
        contract: FolioleCompanionLearningSyncStateContract,
        objectId: String,
        contentHash: String,
        deviceId: String,
        timestamp: String
    ) throws {
        let baseHash = try existingBaseHash(contract, objectId)
        try execute(contract.stateUpsertSQL, bindings: [
            .text(contract.objectType), .text(objectId), .integer(try nextStateSequence(contract)), .null,
            .text(contentHash), baseHash.map(FolioleCompanionLearningBinding.text) ?? .null,
            .text(deviceId), .text(timestamp), .null, .integer(1)
        ])
        if try tableExists(contract.pushAckTable) {
            try execute(contract.pushAckDeleteSQL, bindings: [.text(contract.objectType), .text(objectId)])
        }
    }

    func execute(_ sql: String, bindings: [FolioleCompanionLearningBinding] = []) throws {
        let statement = try prepare(sql, bindings)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw error(message()) }
    }

    static func contentHash(_ value: [String: Any]) throws -> String {
        let data = Data(try stableJson(value).utf8)
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    static func stableJson(_ value: Any) throws -> String {
        if value is NSNull { return "null" }
        if let object = value as? [String: Any] {
            let entries = try object.keys.sorted().map { key in
                "\(try quoted(key)):\(try stableJson(object[key]!))"
            }
            return "{\(entries.joined(separator: ","))}"
        }
        if let array = value as? [Any] {
            return "[\(try array.map(stableJson).joined(separator: ","))]"
        }
        if let string = value as? String { return try quoted(string) }
        if let number = value as? NSNumber {
            if CFGetTypeID(number) == CFBooleanGetTypeID() { return number.boolValue ? "true" : "false" }
            guard number.doubleValue.isFinite else { throw canonicalError("non-finite number") }
            return number.doubleValue == 0 ? "0" : number.stringValue
        }
        throw canonicalError("unsupported JSON value")
    }

    static func normalized(_ value: String?) -> String? {
        let value = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return value?.isEmpty == false ? value : nil
    }

    static func timestamp() -> String { ISO8601DateFormatter().string(from: Date()) }

    private static func quoted(_ value: String) throws -> String {
        let data = try JSONSerialization.data(
            withJSONObject: value, options: [.fragmentsAllowed, .withoutEscapingSlashes]
        )
        guard let result = String(data: data, encoding: .utf8) else { throw canonicalError("invalid string") }
        return result
    }

    private static func canonicalError(_ detail: String) -> NSError {
        NSError(domain: "FolioleCompanionLearningCanonicalJson", code: 1,
                userInfo: [NSLocalizedDescriptionKey: detail])
    }

    private func existingBaseHash(
        _ contract: FolioleCompanionLearningSyncStateContract, _ objectId: String
    ) throws -> String? {
        guard let row = try queryRow(
            contract.existingStateSQL, bindings: [.text(contract.objectType), .text(objectId)]
        ) else { return nil }
        let contentHash = row[safe: 0] ?? nil
        let savedBaseHash = row[safe: 1] ?? nil
        let dirty = Int((row[safe: 2] ?? nil) ?? "0") == 1
        return dirty ? (savedBaseHash ?? contentHash) : contentHash
    }

    private func nextStateSequence(_ contract: FolioleCompanionLearningSyncStateContract) throws -> Int {
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

    private func queryRow(
        _ sql: String, bindings: [FolioleCompanionLearningBinding] = []
    ) throws -> [String?]? {
        let statement = try prepare(sql, bindings)
        defer { sqlite3_finalize(statement) }
        let status = sqlite3_step(statement)
        if status == SQLITE_DONE { return nil }
        guard status == SQLITE_ROW else { throw error(message()) }
        return (0..<sqlite3_column_count(statement)).map { index in
            sqlite3_column_text(statement, index).map { String(cString: $0) }
        }
    }

    private func prepare(
        _ sql: String, _ bindings: [FolioleCompanionLearningBinding]
    ) throws -> OpaquePointer {
        guard let database else { throw error("database closed") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw error(message())
        }
        for (offset, binding) in bindings.enumerated() { try binding.bind(statement, Int32(offset + 1)) }
        return statement
    }

    private func message() -> String { database.map { String(cString: sqlite3_errmsg($0)) } ?? "SQLite error" }
    private func error(_ text: String) -> NSError {
        NSError(domain: "FolioleCompanionLearningWriteDatabase", code: 1,
                userInfo: [NSLocalizedDescriptionKey: text])
    }
}

enum FolioleCompanionLearningBinding {
    case double(Double), integer(Int), null, text(String)

    func bind(_ statement: OpaquePointer, _ index: Int32) throws {
        let status: Int32
        switch self {
        case .double(let value): status = sqlite3_bind_double(statement, index, value)
        case .integer(let value): status = sqlite3_bind_int64(statement, index, sqlite3_int64(value))
        case .null: status = sqlite3_bind_null(statement, index)
        case .text(let value): status = sqlite3_bind_text(statement, index, value, -1, Self.transient)
        }
        guard status == SQLITE_OK else { throw NSError(domain: "FolioleLearningBinding", code: 1) }
    }

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
}

private extension Array {
    subscript(safe index: Index) -> Element? { indices.contains(index) ? self[index] : nil }
}

extension FolioleCompanionReadingWriteContract: FolioleCompanionLearningSyncStateContract {}
