import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleCompanionAppDataFilesTests: XCTestCase {
    func testClearsLocalFilesAndPreferencesIdempotentlyWithoutChangingInstallationIdentity() throws {
        let manager = FileManager.default
        let root = manager.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let suite = "FolioleClearTests." + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer {
            try? manager.removeItem(at: root)
            defaults.removePersistentDomain(forName: suite)
        }
        for name in ["attachments", "attachments.trash", "SyncRequests"] {
            let directory = root.appendingPathComponent(name)
            try manager.createDirectory(at: directory, withIntermediateDirectories: true)
            try Data("original".utf8).write(to: directory.appendingPathComponent("data"))
        }
        try Data("observed".utf8).write(to: root.appendingPathComponent("attachment-observations.json"))
        try Data("invalid-json".utf8).write(to: root.appendingPathComponent("foliole-share-inbox.json"))
        defaults.set("old-key", forKey: "foliole.sync.request.nonce.test")
        defaults.set(false, forKey: "foliole.syncGroup.syncEnabled")
        defaults.set(true, forKey: "foliole.device-anchor.installation-marker.v1")
        defaults.set("system", forKey: "unrelated")
        try FolioleCompanionAppDataFiles.clear(support: root, attachmentDirectory: "attachments", defaults: defaults)
        try FolioleCompanionAppDataFiles.clear(support: root, attachmentDirectory: "attachments", defaults: defaults)
        try FolioleCompanionAppDataFiles.clearShareInbox(at: root)
        try FolioleCompanionAppDataFiles.clearShareInbox(at: root)
        XCTAssertEqual(try manager.contentsOfDirectory(atPath: root.path), [])
        XCTAssertNil(defaults.object(forKey: "foliole.syncGroup.syncEnabled"))
        XCTAssertNil(defaults.object(forKey: "foliole.sync.request.nonce.test"))
        XCTAssertTrue(defaults.bool(forKey: "foliole.device-anchor.installation-marker.v1"))
        XCTAssertEqual(defaults.string(forKey: "unrelated"), "system")
    }
}
