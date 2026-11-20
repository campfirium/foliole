import Foundation

enum FolioleAttachmentTrashMove {
    static func move(_ source: URL, to destination: URL) throws {
        let manager = FileManager.default
        guard manager.fileExists(atPath: source.path) else { return }
        try requireRegularFile(source)
        try manager.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        if manager.fileExists(atPath: destination.path) {
            try requireRegularFile(destination)
            try manager.removeItem(at: source)
        } else {
            try manager.moveItem(at: source, to: destination)
        }
    }

    static func requireRegularFile(_ file: URL) throws {
        let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else {
            throw NSError(domain: "AttachmentMaintenance", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid attachment file operation"])
        }
    }
}
