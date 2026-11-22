import Foundation

/// Maps archive entry names onto the folder backup layout. A zip made from the backup folder
/// may hold the files at its root or inside one enclosing folder; every backup file must
/// share that one location, and unsafe or foreign entries never reach the staging area.
final class FolioleBackupRestoreArchiveLayout {
    enum Kind { case database, sidecar, attachment, ignored }

    static let attachmentFolder = "Attachments"
    private let databaseName: String
    private var prefix: String?

    init(databaseName: String) { self.databaseName = databaseName }

    func classify(_ rawName: String) throws -> (kind: Kind, name: String) {
        let path = rawName.replacingOccurrences(of: "\\", with: "/")
        if path.hasPrefix("/") || path.range(of: "^[A-Za-z]:/", options: .regularExpression) != nil {
            throw restoreError("restore_unsafe_archive")
        }
        if path.hasSuffix("/") { return (.ignored, "") }
        let parts = path.components(separatedBy: "/")
        if parts.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) { throw restoreError("restore_unsafe_archive") }
        if parts[0] == "__MACOSX" { return (.ignored, "") }
        let last = parts[parts.count - 1]
        if last.hasPrefix("._") || last.hasPrefix(".foliole-") { return (.ignored, "") }
        if parts.count <= 2 && isDatabaseFile(last) {
            try claim(parts.count == 2 ? parts[0] : "")
            return (last == databaseName ? .database : .sidecar, last)
        }
        if parts.count >= 2 && parts.count <= 3 && parts[parts.count - 2] == Self.attachmentFolder {
            try claim(parts.count == 3 ? parts[0] : "")
            return (.attachment, last)
        }
        return (.ignored, "")
    }

    func isSidecar(_ name: String) -> Bool { name == databaseName + "-journal" || name == databaseName + "-wal" }

    private func isDatabaseFile(_ name: String) -> Bool { name == databaseName || isSidecar(name) }

    private func claim(_ location: String) throws {
        if prefix == nil { prefix = location } else if prefix != location { throw restoreError("restore_multiple_backups") }
    }
}

/// Restore failures carry a stable code as their message; the shared web layer maps it to copy.
func restoreError(_ code: String) -> NSError {
    NSError(domain: "FolioleBackupRestore", code: 1, userInfo: [NSLocalizedDescriptionKey: code])
}

struct FolioleRestoreCancelled: Error {}
