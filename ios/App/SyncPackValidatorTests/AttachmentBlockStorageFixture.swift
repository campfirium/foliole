import CryptoKit
import Foundation
@testable import FolioleSyncPackValidator

final class AttachmentBlockStorageFixture {
    let directory: URL
    let root: URL
    let trash: URL
    let storage: FolioleAttachmentBlockStorage
    let key = String(repeating: "a", count: 64) + ".pdf"

    init() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString).resolvingSymlinksInPath()
        root = directory.appendingPathComponent("Assets")
        trash = directory.appendingPathComponent("Assets.trash")
        let trashDirectory = trash
        storage = try FolioleAttachmentBlockStorage(root: root, trash: { trashDirectory })
        try FileManager.default.createDirectory(at: trash, withIntermediateDirectories: true)
    }

    var partial: URL { root.appendingPathComponent(".attachment-\(key.prefix(64)).partial") }
    var published: URL { root.appendingPathComponent(key) }

    func close() {
        storage.close()
        try? FileManager.default.removeItem(at: directory)
    }

    @discardableResult
    func call(_ action: String, key: String? = nil, partial: Bool = false,
              numbers: [String: Double] = [:], bytes: Data? = nil) throws -> [String: Any] {
        try storage.execute(action: action, key: key ?? self.key, partial: partial,
                            number: { numbers[$0] }, base64: bytes?.base64EncodedString())
    }

    static func hash(_ bytes: Data) -> String {
        SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    }
}
