import Foundation

enum FolioleCompanionAppDataFiles {
    static func clearShareInbox(at directory: URL) throws {
        var coordinationError: NSError?
        var removalError: Error?
        NSFileCoordinator().coordinate(writingItemAt: directory, options: .forMerging, error: &coordinationError) { root in
            let file = root.appendingPathComponent("foliole-share-inbox.json")
            do {
                if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
            } catch { removalError = error }
        }
        if let coordinationError { throw coordinationError }
        if let removalError { throw removalError }
    }

    static func clear(support: URL, attachmentDirectory: String, defaults: UserDefaults = .standard) throws {
        let manager = FileManager.default
        for name in [attachmentDirectory, attachmentDirectory + ".trash", "attachment-observations.json", "folder-database-backup.json", "SyncRequests"] {
            let file = support.appendingPathComponent(name)
            if manager.fileExists(atPath: file.path) { try manager.removeItem(at: file) }
        }
        for key in defaults.dictionaryRepresentation().keys
            where key.hasPrefix("foliole.") && key != "foliole.device-anchor.installation-marker.v1" {
            defaults.removeObject(forKey: key)
        }
    }
}
