import Foundation
import CryptoKit
import SQLite3

final class FolioleReadOnlySQLite {
    private var database: OpaquePointer?

    init(url: URL) throws {
        let status = sqlite3_open_v2(url.path, &database, SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX, nil)
        guard status == SQLITE_OK else {
            let message = database.map { String(cString: sqlite3_errmsg($0)) } ?? "open failed"
            if let database { sqlite3_close(database) }
            throw Self.error(message)
        }
    }

    deinit {
        if let database { sqlite3_close(database) }
    }

    func rows(_ sql: String, arguments: [String] = []) throws -> [[String?]] {
        guard let database else { throw Self.error("database closed") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw Self.error(String(cString: sqlite3_errmsg(database)))
        }
        defer { sqlite3_finalize(statement) }
        try bind(arguments, statement: statement)
        var result: [[String?]] = []
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { return result }
            guard status == SQLITE_ROW else { throw Self.error(String(cString: sqlite3_errmsg(database))) }
            result.append((0..<sqlite3_column_count(statement)).map { index in
                sqlite3_column_text(statement, index).map { String(cString: $0) }
            })
        }
    }

    private func bind(_ arguments: [String], statement: OpaquePointer) throws {
        for (offset, value) in arguments.enumerated() {
            let status = sqlite3_bind_text(statement, Int32(offset + 1), value, -1, Self.transient)
            guard status == SQLITE_OK else { throw Self.error("bind failed") }
        }
    }

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private static func error(_ message: String) -> NSError {
        NSError(domain: "FolioleReadOnlySQLite", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

enum FolioleCompanionDatabaseLocation {
    static func mainDatabase(fileManager: FileManager = .default) throws -> URL {
        guard let library = fileManager.urls(for: .libraryDirectory, in: .userDomainMask).first else {
            throw NSError(domain: "FolioleDatabaseLocation", code: 1)
        }
        return library.appendingPathComponent("CapacitorDatabase/foliole-companionSQLite.db")
    }

    static func canonicalDeviceId() throws -> String {
        let database = try FolioleReadOnlySQLite(url: try mainDatabase())
        let rows = try database.rows("SELECT value FROM companion_meta WHERE key = ?", arguments: ["device_id"])
        guard rows.count == 1, let value = rows[0][0], !value.isEmpty else {
            throw NSError(
                domain: "FolioleDatabaseLocation",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Companion database device identity is unavailable."]
            )
        }
        return value
    }
}

final class FolioleCompanionContentBlobDatabase {
    private let contract: FolioleCompanionContentBlobContract
    private var database: OpaquePointer?

    init(url: URL, contract: FolioleCompanionContentBlobContract) throws {
        self.contract = contract
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(url.path, &database, flags, nil) == SQLITE_OK else { throw error("open failed") }
        sqlite3_busy_timeout(database, 5_000)
    }

    deinit { if let database { sqlite3_close(database) } }

    func loadMissing(limit: Int) throws -> [String: Any] {
        let limit = max(1, min(limit, 500))
        let blobs = try rows(sql("missing"), bindings: [.integer(limit)]).map { row in
            ["hash": row[0].text, "size_bytes": row[1].integer] as [String: Any]
        }
        let summary = try rows(sql("missingSummary"))
        let failedStatus = try value("failed", in: contract.statuses)
        let failed = summary.filter { $0[2].text == failedStatus }
        return [
            try value("blobs", in: contract.missingResultKeys): blobs,
            try value("hashes", in: contract.missingResultKeys): blobs.map { $0["hash"] as? String ?? "" },
            try value("missingCount", in: contract.missingResultKeys): summary.count,
            try value("missingBytes", in: contract.missingResultKeys): summary.reduce(0) { $0 + $1[1].integer },
            try value("failedCount", in: contract.missingResultKeys): failed.count,
            try value("failedBytes", in: contract.missingResultKeys): failed.reduce(0) { $0 + $1[1].integer }
        ]
    }

    func commit(parts: [FolioleCompanionContentBlobPart], failedHashes: [String]) throws -> [String] {
        let uniqueHashes = Set(parts.map(\.hash))
        guard uniqueHashes.count == parts.count else { throw error("duplicate content blob") }
        let manifests = try loadManifests(Array(uniqueHashes))
        var accepted: [FolioleCompanionContentBlobPart] = []
        var failures = Set(failedHashes)
        for part in parts {
            if try matches(part, manifest: manifests[part.hash]) { accepted.append(part) } else { failures.insert(part.hash) }
        }
        try execute("BEGIN IMMEDIATE")
        do {
            let now = ISO8601DateFormatter().string(from: Date())
            for part in accepted {
                try execute(sql("dataReplace"), bindings: [.text(part.hash), .data(part.data)])
                guard try execute(sql("markCached"), bindings: [.text(now), .text(now), .text(part.hash)]) > 0 else {
                    throw error("content blob manifest is missing")
                }
            }
            for hash in failures where try isHash(hash) {
                _ = try execute(sql("markFailed"), bindings: [.text(hash)])
            }
            try execute("COMMIT")
            return accepted.map(\.hash)
        } catch {
            _ = try? execute("ROLLBACK")
            throw error
        }
    }

    private func loadManifests(_ hashes: [String]) throws -> [String: Manifest] {
        guard !hashes.isEmpty else { return [:] }
        for hash in hashes where try !isHash(hash) { throw error("invalid content blob hash") }
        let placeholders = Array(repeating: "?", count: hashes.count).joined(separator: ", ")
        let query = sql("manifests").replacingOccurrences(of: contract.hashesReplacement, with: placeholders)
        return try rows(query, bindings: hashes.map(Binding.text)).reduce(into: [:]) { result, row in
            result[row[0].text] = Manifest(
                compression: row[1].text,
                originalSize: row[2].integer,
                storedSize: row[3].integer,
                originalHash: row[4].text,
                storedHash: row[5].text
            )
        }
    }

    private func matches(_ part: FolioleCompanionContentBlobPart, manifest: Manifest?) throws -> Bool {
        guard try isHash(part.hash), let manifest, manifest.compression == contract.supportedCompression else { return false }
        let digest = SHA256.hash(data: part.data).map { String(format: "%02x", $0) }.joined()
        return digest == part.hash && manifest.originalHash == part.hash && manifest.storedHash == part.hash &&
            manifest.originalSize == part.data.count && manifest.storedSize == part.data.count
    }

    private func isHash(_ value: String) throws -> Bool {
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return try NSRegularExpression(pattern: contract.hashPattern).firstMatch(in: value, range: range)?.range == range
    }

    private func rows(_ sql: String, bindings: [Binding] = []) throws -> [[Column]] {
        let statement = try prepare(sql, bindings: bindings)
        defer { sqlite3_finalize(statement) }
        var result: [[Column]] = []
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { return result }
            guard status == SQLITE_ROW else { throw error(message()) }
            result.append((0..<sqlite3_column_count(statement)).map { Column(statement, $0) })
        }
    }

    @discardableResult private func execute(_ sql: String, bindings: [Binding] = []) throws -> Int {
        let statement = try prepare(sql, bindings: bindings)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw error(message()) }
        return Int(sqlite3_changes(database))
    }

    private func prepare(_ sql: String, bindings: [Binding]) throws -> OpaquePointer {
        guard let database else { throw error("database closed") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw error(message()) }
        for (index, binding) in bindings.enumerated() { try binding.bind(statement, Int32(index + 1)) }
        return statement
    }

    private func sql(_ key: String) -> String { contract.sql[key] ?? "invalid.\(key)" }
    private func value(_ key: String, in values: [String: String]) throws -> String {
        guard let value = values[key] else { throw error("missing contract key \(key)") }
        return value
    }
    private func message() -> String { database.map { String(cString: sqlite3_errmsg($0)) } ?? "SQLite error" }
    private func error(_ message: String) -> NSError {
        NSError(domain: "FolioleContentBlobDatabase", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private struct Manifest { let compression: String; let originalSize: Int; let storedSize: Int; let originalHash: String; let storedHash: String }
    private struct Column {
        let integer: Int
        let text: String
        init(_ statement: OpaquePointer, _ index: Int32) {
            integer = Int(sqlite3_column_int64(statement, index))
            text = sqlite3_column_text(statement, index).map { String(cString: $0) } ?? ""
        }
    }
    private enum Binding {
        case data(Data), integer(Int), text(String)
        func bind(_ statement: OpaquePointer, _ index: Int32) throws {
            let status: Int32
            switch self {
            case .data(let value): status = value.withUnsafeBytes { sqlite3_bind_blob(statement, index, $0.baseAddress, Int32(value.count), Self.transient) }
            case .integer(let value): status = sqlite3_bind_int64(statement, index, sqlite3_int64(value))
            case .text(let value): status = sqlite3_bind_text(statement, index, value, -1, Self.transient)
            }
            guard status == SQLITE_OK else { throw NSError(domain: "FolioleContentBlobDatabase", code: 2) }
        }
        private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    }
}
