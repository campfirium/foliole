import Foundation

/// Reads a local backup zip or backup folder into staging. Callers own any security scope or
/// file coordination of the source; these readers only see plain local URLs.
enum FolioleBackupRestoreSources {
    private static let spaceMargin: Int64 = 64 * 1024 * 1024

    static func readZip(_ zip: URL, databaseName: String, staging: FolioleBackupRestoreStaging) throws {
        let reader = try FolioleBackupRestoreZipReader(url: zip)
        let entries = try reader.entries()
        if entries.isEmpty { throw restoreError("restore_not_archive") }
        let planned = FolioleBackupRestoreArchiveLayout(databaseName: databaseName)
        var needed: Int64 = 0
        for entry in entries {
            if try planned.classify(entry.name).kind != .ignored { needed += Int64(clamping: entry.size) }
        }
        try requireSpace(needed, at: staging.database.deletingLastPathComponent())
        let layout = FolioleBackupRestoreArchiveLayout(databaseName: databaseName)
        for entry in entries {
            let mapped = try layout.classify(entry.name)
            let chunks: FolioleBackupRestoreStaging.Chunks = { sink in try reader.read(entry, into: sink) }
            switch mapped.kind {
            case .database: try staging.database(chunks)
            case .sidecar: try staging.sidecar(chunks)
            case .attachment: try staging.attachment(mapped.name, chunks)
            case .ignored: continue
            }
        }
        try staging.finish()
    }

    static func readFolder(_ folder: URL, databaseName: String, staging: FolioleBackupRestoreStaging) throws {
        let root = try children(folder)
        guard let database = root.first(where: { $0.lastPathComponent == databaseName && !isDirectory($0) }) else {
            throw restoreError("restore_not_backup")
        }
        let layout = FolioleBackupRestoreArchiveLayout(databaseName: databaseName)
        let attachmentFolder = folder.appendingPathComponent(FolioleBackupRestoreArchiveLayout.attachmentFolder, isDirectory: true)
        let attachments = isDirectory(attachmentFolder) ? try children(attachmentFolder).filter { !isDirectory($0) } : []
        let needed = ([database] + attachments).reduce(Int64(0)) { total, file in
            total + Int64((try? file.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0)
        }
        try requireSpace(needed, at: staging.database.deletingLastPathComponent())
        for file in root where !isDirectory(file) && layout.isSidecar(file.lastPathComponent) {
            try staging.sidecar(FolioleBackupRestoreStaging.file(file))
        }
        try staging.database(FolioleBackupRestoreStaging.file(database))
        for file in attachments { try staging.attachment(file.lastPathComponent, FolioleBackupRestoreStaging.file(file)) }
        try staging.finish()
    }

    static func requireSpace(_ needed: Int64, at directory: URL) throws {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let values = try? directory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey, .volumeAvailableCapacityKey])
        // Important-usage capacity counts purgeable space but can read as zero; plain free space is the floor.
        let available = max(values?.volumeAvailableCapacityForImportantUsage ?? 0, Int64(values?.volumeAvailableCapacity ?? 0))
        guard available > 0 else { return }
        if needed + spaceMargin > available { throw restoreError("restore_insufficient_space:\(needed)") }
    }

    private static func children(_ directory: URL) throws -> [URL] {
        do { return try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isDirectoryKey]) }
        catch { throw restoreError("restore_source_unreadable") }
    }

    private static func isDirectory(_ url: URL) -> Bool {
        var directory: ObjCBool = false
        return FileManager.default.fileExists(atPath: url.path, isDirectory: &directory) && directory.boolValue
    }
}
