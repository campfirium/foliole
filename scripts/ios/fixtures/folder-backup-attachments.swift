import CryptoKit
import Foundation

@main
struct AttachmentBackupFixture {
    static func main() throws {
        let root = URL(fileURLWithPath: CommandLine.arguments[1])
        let live = root.appendingPathComponent("live"), trash = root.appendingPathComponent("trash")
        let target = root.appendingPathComponent("backup")
        for folder in [live, trash, target] { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
        let data = Data(repeating: 42, count: 200_000)
        let key = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() + ".png"
        let file = live.appendingPathComponent(key)
        try data.write(to: file)
        let roots = [live, trash]
        func verify(_ condition: Bool) { precondition(condition) }
        func copy(_ check: () throws -> Void = {}) throws -> Bool {
            try FolioleFolderBackupAttachments.copy(key, roots: roots, directory: target, profile: "owner", check: check)
        }
        func remove() throws { try FolioleFolderBackupAttachments.delete(key, roots: roots, directory: target, check: {}) }
        func reject(_ action: () throws -> Void) {
            do { try action(); preconditionFailure("unsafe operation succeeded") } catch {}
        }
        verify(try copy())
        verify(try !copy())
        let saved = target.appendingPathComponent("Attachments/" + key)
        verify(try Data(contentsOf: saved) == data)
        reject { try remove() }
        try FileManager.default.moveItem(at: file, to: trash.appendingPathComponent(key))
        reject { try remove() }
        try FileManager.default.removeItem(at: trash.appendingPathComponent(key))
        try Data([0]).write(to: saved)
        reject { try remove() }
        verify(try Data(contentsOf: saved) == Data([0]))
        try data.write(to: saved)
        try remove()
        precondition(!FileManager.default.fileExists(atPath: saved.path))
        try data.write(to: file)
        reject { _ = try copy { throw backupError("cancelled") } }
        precondition(!FileManager.default.fileExists(atPath: saved.path))
        try FileManager.default.removeItem(at: file)
        try FileManager.default.createSymbolicLink(at: file, withDestinationURL: root.appendingPathComponent("outside"))
        reject { _ = try copy() }
        print("attachment-contract-passed")
    }
}
