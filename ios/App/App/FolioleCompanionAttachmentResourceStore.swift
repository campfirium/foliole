import Foundation
import SQLite3

final class FolioleCompanionAttachmentResourceStore {
    private let contract: FolioleCompanionAttachmentResourceContract
    private let rootURL: URL
    private var database: OpaquePointer?

    init(databaseURL: URL, rootURL: URL? = nil, contract: FolioleCompanionAttachmentResourceContract) throws {
        self.contract = contract
        self.rootURL = try rootURL ?? Self.defaultRoot(contract.directoryName)
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(databaseURL.path, &database, flags, nil) == SQLITE_OK else { throw error("open failed") }
        sqlite3_busy_timeout(database, 5_000)
        try FileManager.default.createDirectory(at: self.rootURL, withIntermediateDirectories: true)
    }

    deinit { if let database { sqlite3_close(database) } }

    var temporaryRoot: URL { rootURL.appendingPathComponent(".tmp", isDirectory: true) }

    func loadMissing(limit: Int) throws -> [String: Any] {
        let resources = try missingResources(try rows(sql("missingRows")), limit: limit)
        return [try value("resources", in: contract.missingResultKeys): resources]
    }

    func loadMissing(attachmentId: String) throws -> [String: Any] {
        let rows = try rows(sql("missingById"), bindings: [.text(attachmentId)])
        let resource = try missingResources(rows, limit: 1).first
        return [try value("resource", in: contract.missingResultKeys): resource ?? NSNull()]
    }

    func resolve(attachmentId: String) throws -> [String: Any] {
        let keys = contract.resolveResponseKeys
        guard let row = try rows(sql("resolve"), bindings: [.text(attachmentId)]).first else {
            return [try value("status", in: keys): try value("notFound", in: contract.resolveStatuses),
                    try value("resourceUrl", in: keys): NSNull()]
        }
        let mimeType: Any = row[1].text.isEmpty ? NSNull() : row[1].text
        guard !row[0].text.isEmpty, FileManager.default.fileExists(atPath: fileURL(row[0].text).path) else {
            return [try value("status", in: keys): try value("missingFile", in: contract.resolveStatuses),
                    try value("mimeType", in: keys): mimeType,
                    try value("resourceUrl", in: keys): NSNull()]
        }
        return [try value("status", in: keys): try value("readyStatusKey", in: contract.resolveStatuses),
                try value("mimeType", in: keys): mimeType,
                try value("resourceUrl", in: keys): fileURL(row[0].text).absoluteString]
    }

    func commit(_ batch: FolioleCompanionAttachmentResourceSessions.Batch) throws -> [String] {
        let ids = batch.downloaded.map(\.attachmentId)
        guard Set(ids).count == ids.count else { throw error("duplicate attachment resource") }
        let manifests = try loadManifests(ids)
        var syncedIds: [String] = []
        var failedIds = Set(batch.failedIds)
        try execute("BEGIN IMMEDIATE")
        do {
            let now = ISO8601DateFormatter().string(from: Date())
            for item in batch.downloaded {
                do {
                    guard manifests[item.attachmentId] == item.contentHash else { throw error("attachment manifest is missing") }
                    try commitFile(item)
                    guard try execute(sql("markCached"), bindings: [
                        .text(item.contentHash), .text(now), .text(now), .text(item.attachmentId)
                    ]) > 0 else { throw error("attachment manifest is missing") }
                    syncedIds.append(item.attachmentId)
                } catch {
                    failedIds.insert(item.attachmentId)
                    try? FileManager.default.removeItem(at: item.temporaryURL)
                }
            }
            for attachmentId in failedIds { _ = try execute(sql("markFailed"), bindings: [.text(attachmentId)]) }
            try execute("COMMIT")
            return syncedIds
        } catch {
            _ = try? execute("ROLLBACK")
            throw error
        }
    }

    private func missingResources(_ rows: [[Column]], limit: Int) throws -> [[String: Any]] {
        let cached = try value("cached", in: contract.statuses)
        return rows.filter { row in
            row[3].text != cached || row[4].text.isEmpty || !FileManager.default.fileExists(atPath: fileURL(row[4].text).path)
        }.prefix(max(1, min(limit, 500))).map { row in
            ["attachment_id": row[0].text, "content_hash": row[1].text, "size_bytes": row[2].integer]
        }
    }

    private func loadManifests(_ ids: [String]) throws -> [String: String] {
        guard !ids.isEmpty else { return [:] }
        let placeholders = Array(repeating: "?", count: ids.count).joined(separator: ", ")
        let query = sql("contentHashes").replacingOccurrences(of: contract.idFilterReplacement, with: placeholders)
        return try rows(query, bindings: ids.map(Binding.text)).reduce(into: [:]) { result, row in
            result[row[0].text] = row[1].text
        }
    }

    private func commitFile(_ item: FolioleCompanionDownloadedAttachment) throws {
        let outputURL = fileURL(item.contentHash)
        if FileManager.default.fileExists(atPath: outputURL.path) {
            if try FolioleCompanionAttachmentResourceDownloader.digestHex(outputURL) == item.contentHash {
                try? FileManager.default.removeItem(at: item.temporaryURL)
                return
            }
            _ = try FileManager.default.replaceItemAt(outputURL, withItemAt: item.temporaryURL)
            return
        }
        try FileManager.default.moveItem(at: item.temporaryURL, to: outputURL)
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

    private func fileURL(_ key: String) -> URL { rootURL.appendingPathComponent(key) }
    private func sql(_ key: String) -> String { contract.sql[key] ?? "invalid.\(key)" }
    private func value(_ key: String, in values: [String: String]) throws -> String {
        guard let value = values[key] else { throw error("missing contract key \(key)") }
        return value
    }
    private func message() -> String { database.map { String(cString: sqlite3_errmsg($0)) } ?? "SQLite error" }
    private func error(_ message: String) -> NSError {
        NSError(domain: "FolioleAttachmentResourceStore", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
    private static func defaultRoot(_ directoryName: String) throws -> URL {
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return support.appendingPathComponent(directoryName, isDirectory: true)
    }

    private struct Column {
        let integer: Int
        let text: String
        init(_ statement: OpaquePointer, _ index: Int32) {
            integer = Int(sqlite3_column_int64(statement, index))
            text = sqlite3_column_text(statement, index).map { String(cString: $0) } ?? ""
        }
    }
    private enum Binding {
        case text(String)
        func bind(_ statement: OpaquePointer, _ index: Int32) throws {
            guard sqlite3_bind_text(statement, index, value, -1, Self.transient) == SQLITE_OK else {
                throw NSError(domain: "FolioleAttachmentResourceStore", code: 2)
            }
        }
        private var value: String {
            switch self { case .text(let value): return value }
        }
        private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    }
}
