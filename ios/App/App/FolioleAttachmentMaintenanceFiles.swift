import Capacitor
import CryptoKit
import Foundation

extension FolioleCompanionSyncPlugin {
    @objc func maintainAttachmentFiles(_ call: CAPPluginCall) {
        Task {
            do { call.resolve(try FolioleAttachmentMaintenanceFiles.execute(call)) }
            catch { call.reject("Attachment maintenance failed: \(error.localizedDescription)") }
        }
    }
}

enum FolioleAttachmentMaintenanceFiles {
    private static let manager = FileManager.default

    static func directory(_ trash: Bool) throws -> URL {
        let support = try manager.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                      appropriateFor: nil, create: true)
        let contract = try FolioleCompanionContractStore().attachmentResourceContract()
        return support.appendingPathComponent(contract.directoryName + (trash ? ".trash" : ""), isDirectory: true)
    }

    static func execute(_ call: CAPPluginCall) throws -> JSObject {
        let operation = call.getString("operation") ?? ""
        let state = try directory(false).deletingLastPathComponent().appendingPathComponent("attachment-observations.json")
        if operation == "read-state" {
            guard manager.fileExists(atPath: state.path) else { return ["state": NSNull()] }
            return ["state": try String(contentsOf: state, encoding: .utf8)]
        }
        if operation == "write-state" {
            try (call.getString("state") ?? "").write(to: state, atomically: true, encoding: .utf8)
            return [:]
        }
        if operation == "generation" { return try generation(call.getString("databasePath") ?? "") }
        if operation == "inventory" { return ["files": try inventory(call.getBool("trash") ?? false)] }
        let key = call.getString("storageKey") ?? ""
        guard FolioleCompanionCanonicalAttachmentKey.valid(key) else { throw invalid() }
        if operation == "move" { try move(key, toTrash: call.getBool("trash") ?? false) }
        else if operation == "remove-trash" {
            let file = try directory(true).appendingPathComponent(key)
            try requireFile(file)
            try manager.removeItem(at: file)
        } else { throw invalid() }
        return [:]
    }

    static func move(_ key: String, toTrash: Bool) throws {
        guard FolioleCompanionCanonicalAttachmentKey.valid(key) else { throw invalid() }
        let source = try directory(!toTrash).appendingPathComponent(key)
        let destination = try directory(toTrash).appendingPathComponent(key)
        guard manager.fileExists(atPath: source.path) else { return }
        try requireFile(source)
        try manager.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        if manager.fileExists(atPath: destination.path) {
            try requireFile(destination)
            for file in [source, destination] {
                let hash = SHA256.hash(data: try Data(contentsOf: file)).map { String(format: "%02x", $0) }.joined()
                guard hash == String(key.prefix(64)) else { throw invalid() }
            }
            try manager.removeItem(at: source)
        } else { try manager.moveItem(at: source, to: destination) }
    }

    private static func inventory(_ trash: Bool) throws -> [JSObject] {
        let root = try directory(trash)
        guard manager.fileExists(atPath: root.path) else { return [] }
        return try manager.contentsOfDirectory(at: root, includingPropertiesForKeys: [.fileSizeKey]).compactMap { file in
            guard FolioleCompanionCanonicalAttachmentKey.valid(file.lastPathComponent) else { return nil }
            try requireFile(file)
            let values = try file.resourceValues(forKeys: [.fileSizeKey])
            return ["storageKey": file.lastPathComponent, "sizeBytes": values.fileSize ?? 0]
        }
    }

    private static func generation(_ databasePath: String) throws -> JSObject {
        let path = URL(fileURLWithPath: databasePath).resolvingSymlinksInPath().path
        guard path.hasPrefix(URL(fileURLWithPath: NSHomeDirectory()).resolvingSymlinksInPath().path + "/") else { throw invalid() }
        let values = try manager.attributesOfItem(atPath: path)
        return ["generation": "\(values[.systemNumber] ?? ""):\(values[.systemFileNumber] ?? ""):\(values[.creationDate] ?? "")"]
    }

    private static func requireFile(_ file: URL) throws {
        let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else { throw invalid() }
    }

    private static func invalid() -> NSError {
        NSError(domain: "AttachmentMaintenance", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid attachment file operation"])
    }
}
