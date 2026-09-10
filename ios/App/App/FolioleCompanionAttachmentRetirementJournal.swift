import Capacitor
import Foundation

enum FolioleCompanionAttachmentRetirementJournal {
    static func prepare(_ call: CAPPluginCall, directoryName: String) throws -> [String: Any] {
        guard let raw = call.getArray("tombstones"), !raw.isEmpty else { throw invalid("tombstones is required") }
        guard let libraryScope = call.getString("library_scope"), !libraryScope.isEmpty else {
            throw invalid("library_scope is required")
        }
        let root = try journalRoot(), token = UUID().uuidString.lowercased()
        let stageRoot = root.appendingPathComponent(token, isDirectory: true)
        try FileManager.default.createDirectory(at: stageRoot, withIntermediateDirectories: true)
        let attachmentRoot = try supportRoot().appendingPathComponent(directoryName, isDirectory: true)
        let items = try raw.map { value -> [String: Any] in
            guard let item = value as? [String: Any] else { throw invalid("Invalid attachment tombstone") }
            let attachmentId = try required(item, "attachment_id")
            let contentHash = try required(item, "content_hash")
            let storageKey = try safeName(required(item, "storage_key"))
            let mimeType = try required(item, "mime_type")
            guard contentHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
                throw invalid("Invalid attachment hash")
            }
            let source = attachmentRoot.appendingPathComponent(storageKey)
            let present = FileManager.default.fileExists(atPath: source.path)
            if present {
                let actualHash = try FolioleCompanionAttachmentResourceDownloader.digestHex(source)
                if actualHash != contentHash { throw invalid("Attachment retirement source hash mismatch") }
            }
            return ["attachment_id": attachmentId, "content_hash": contentHash, "storage_key": storageKey,
                    "mime_type": mimeType, "source": source.path,
                    "staged": stageRoot.appendingPathComponent(storageKey).path, "source_present": present]
        }
        let journal = root.appendingPathComponent("\(token).json")
        var value: [String: Any] = ["version": 1, "library_scope": libraryScope,
                                    "stage": "planned", "stage_history": ["planned"], "items": items]
        try write(value, journal)
        try advance(&value, journal, "targets_prepared")
        return ["journal_token": token]
    }

    static func finish(_ call: CAPPluginCall) throws {
        let token = try safeName(call.getString("journal_token") ?? "")
        let journalURL = try journalRoot().appendingPathComponent("\(token).json")
        var journal = try read(journalURL)
        guard let items = journal["items"] as? [[String: Any]] else { throw invalid("Invalid retirement journal") }
        if call.getBool("committed") != true {
            try restore(items)
            try advance(&journal, journalURL, "restored")
            return
        }
        try advance(&journal, journalURL, "database_committed")
        for item in items { try stage(item) }
        for item in items { try verify(item) }
        try advance(&journal, journalURL, "verified")
    }

    static func finalize(_ call: CAPPluginCall) throws {
        let token = try safeName(call.getString("journal_token") ?? "")
        let journalURL = try journalRoot().appendingPathComponent("\(token).json")
        var journal = try read(journalURL)
        let stage = journal["stage"] as? String
        guard stage == "verified" || stage == "finalized",
              let items = journal["items"] as? [[String: Any]] else { throw invalid("Journal is not verified") }
        for item in items {
            guard let stagedPath = item["staged"] as? String else { throw invalid("Invalid staged path") }
            let staged = URL(fileURLWithPath: stagedPath)
            if FileManager.default.fileExists(atPath: staged.path) { try FileManager.default.removeItem(at: staged) }
        }
        try advance(&journal, journalURL, "finalized")
    }

    private static func stage(_ item: [String: Any]) throws {
        guard item["source_present"] as? Bool == true,
              let sourcePath = item["source"] as? String,
              let stagedPath = item["staged"] as? String,
              let contentHash = item["content_hash"] as? String else { return }
        let source = URL(fileURLWithPath: sourcePath), staged = URL(fileURLWithPath: stagedPath)
        if FileManager.default.fileExists(atPath: staged.path) {
            let stagedHash = try FolioleCompanionAttachmentResourceDownloader.digestHex(staged)
            guard stagedHash == contentHash else {
                throw invalid("Attachment retirement staged hash mismatch")
            }
            return
        }
        guard FileManager.default.fileExists(atPath: source.path),
              try FolioleCompanionAttachmentResourceDownloader.digestHex(source) == contentHash else {
            throw invalid("Attachment retirement identity changed")
        }
        try FileManager.default.moveItem(at: source, to: staged)
    }

    private static func verify(_ item: [String: Any]) throws {
        guard item["source_present"] as? Bool == true,
              let sourcePath = item["source"] as? String,
              let stagedPath = item["staged"] as? String,
              let contentHash = item["content_hash"] as? String else { return }
        let source = URL(fileURLWithPath: sourcePath), staged = URL(fileURLWithPath: stagedPath)
        let stagedHash = try FolioleCompanionAttachmentResourceDownloader.digestHex(staged)
        guard !FileManager.default.fileExists(atPath: source.path),
              FileManager.default.fileExists(atPath: staged.path),
              stagedHash == contentHash else {
            throw invalid("Attachment retirement staging verification failed")
        }
    }

    private static func restore(_ items: [[String: Any]]) throws {
        for item in items {
            guard let sourcePath = item["source"] as? String,
                  let stagedPath = item["staged"] as? String else { continue }
            let source = URL(fileURLWithPath: sourcePath), staged = URL(fileURLWithPath: stagedPath)
            if FileManager.default.fileExists(atPath: staged.path),
               !FileManager.default.fileExists(atPath: source.path) {
                try FileManager.default.moveItem(at: staged, to: source)
            }
        }
    }

    private static func supportRoot() throws -> URL {
        try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                    appropriateFor: nil, create: true)
    }

    private static func journalRoot() throws -> URL {
        let root = try supportRoot().appendingPathComponent("attachment-retirement", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }

    private static func read(_ url: URL) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] else {
            throw invalid("Invalid retirement journal")
        }
        return value
    }

    private static func write(_ value: [String: Any], _ url: URL) throws {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: url, options: .atomic)
    }

    private static func advance(_ value: inout [String: Any], _ url: URL, _ stage: String) throws {
        var history = value["stage_history"] as? [String] ?? []
        if history.last != stage { history.append(stage) }
        value["stage"] = stage
        value["stage_history"] = history
        try write(value, url)
    }

    private static func required(_ value: [String: Any], _ key: String) throws -> String {
        guard let result = value[key] as? String, !result.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw invalid("Missing \(key)")
        }
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func safeName(_ value: String) throws -> String {
        guard !value.isEmpty, value != ".", value != "..", !value.contains("/"), !value.contains("\\") else {
            throw invalid("Invalid retirement path component")
        }
        return value
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionAttachmentRetirementJournal", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}
