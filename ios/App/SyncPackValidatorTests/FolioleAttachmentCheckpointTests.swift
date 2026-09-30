import Foundation
import XCTest
@testable import FolioleSyncPackValidator

final class FolioleAttachmentCheckpointTests: XCTestCase {
    private let range = 1_048_576

    func testResumesAtDurableOffsetAndRetreatsFromShortFile() async throws {
        for short in [false, true] {
            let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(at: root) }
            let bytes = Data(repeating: 0x42, count: 3 * range + 17)
            let source = root.appendingPathComponent("source")
            try bytes.write(to: source)
            let hash = try FolioleCompanionAttachmentResourceDownloader.digestHex(source)
            let partial = root.appendingPathComponent("partial")
            let verified = root.appendingPathComponent("verified")
            try (short ? Data(bytes.prefix(range)) : Data(bytes.prefix(2 * range)) + Data(repeating: 0, count: range))
                .write(to: partial)
            let dbURL = root.appendingPathComponent("fixture.db")
            let db = try FolioleCompanionSyncPackSQLite(url: dbURL, create: true)
            try db.execute("CREATE TABLE attachment_receive_checkpoints (content_hash TEXT, temporary_path TEXT, total_bytes INTEGER, confirmed_bytes INTEGER, PRIMARY KEY(content_hash,temporary_path))")
            try seed(dbURL, partial: partial, hash: hash, total: bytes.count)
            let checkpoint = try makeCheckpoint(dbURL, partial: partial, hash: hash)
            var offsets: [Int] = []
            try await FolioleCompanionAttachmentResourceDownloader.receiveFile(
                partial, verified: verified, hash: hash, checkpoint: checkpoint
            ) { offset in
                offsets.append(offset)
                return (Data(bytes[offset..<min(bytes.count, offset + self.range)]), bytes.count)
            }
            XCTAssertEqual(offsets, short ? [0, range, 2 * range, 3 * range] : [0, 2 * range, 3 * range])
            XCTAssertEqual(try Data(contentsOf: verified), bytes)
            XCTAssertEqual(try checkpoint.load(bytes.count), 0)
            // A completed file survives exit before completion metadata and needs no network.
            try checkpoint.save(bytes.count, bytes.count)
            try await FolioleCompanionAttachmentResourceDownloader.receiveFile(
                partial, verified: verified, hash: hash, checkpoint: checkpoint
            ) { _ in XCTFail("Published file must not download again"); throw CancellationError() }
            XCTAssertEqual(try checkpoint.load(bytes.count), 0)
        }
    }

    private func makeCheckpoint(_ dbURL: URL, partial: URL, hash: String) throws -> FolioleCompanionAttachmentCheckpoint {
        let db = try FolioleCompanionSyncPackSQLite(url: dbURL, create: true)
        let sql = try FolioleCompanionContractStore().attachmentResourceContract().sql
        return try FolioleCompanionAttachmentCheckpoint(databasePath: dbURL.path, partialURL: partial, hash: hash) { operation, payload in
            XCTAssertEqual(operation, "attachment_checkpoint")
            let total = payload["total_bytes"] as! Int
            switch payload["action"] as! String {
            case "save":
                try db.execute(sql["checkpointSave"]!, values: [hash, partial.path, total, payload["confirmed_bytes"]])
                return [:]
            case "clear":
                try db.execute(sql["checkpointClear"]!, values: [hash, partial.path])
                return [:]
            default:
                let query = "SELECT total_bytes, confirmed_bytes FROM attachment_receive_checkpoints WHERE content_hash = '\(hash)'"
                let row = try db.namedRows(query).first
                return ["confirmed_bytes": (row?["total_bytes"] as? Int) == total ? row?["confirmed_bytes"] as? Int ?? 0 : 0]
            }
        }
    }

    private func seed(_ dbURL: URL, partial: URL, hash: String, total: Int) throws {
        // Close the checkpoint connection to prove the next instance loads committed SQLite state.
        let checkpoint = try makeCheckpoint(dbURL, partial: partial, hash: hash)
        try checkpoint.save(total, 2 * range)
        XCTAssertEqual(try checkpoint.load(total + 1), 0)
    }
}
