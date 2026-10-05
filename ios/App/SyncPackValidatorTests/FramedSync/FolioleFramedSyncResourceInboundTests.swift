import CryptoKit
import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncResourceInboundTests: XCTestCase {
    private enum TestFailure: Error { case apply }

    func testResourceStagesOutsideSQLiteAndPublishesOnlyAcrossSuccessfulApply() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-ios-resource-inbound-\(UUID().uuidString)")
        let attachments = directory.appendingPathComponent("attachments", isDirectory: true)
        try FileManager.default.createDirectory(at: attachments, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        var resource = Data([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        resource.append(Data(repeating: 0x5a, count: 512 * 1024 + 31))
        let resourceURL = directory.appendingPathComponent("source.png")
        try resource.write(to: resourceURL)
        let fact = makeFact(resource)
        let outbound = try FolioleFramedSyncOutboundSQLite(database: try .init(
            url: directory.appendingPathComponent("outbound.db")
        ))
        let attempt = try FolioleFramedSyncTransferWriter.prepare(
            groupKey: Data(repeating: 0, count: 32), context: context(), facts: [fact],
            blobs: [.init(reference: fact.blobs[0], source: .file(resourceURL))], staging: outbound
        )
        let wire = try FolioleFramedSyncTransferWriter.replay(attempt, staging: outbound)
        let database = try FolioleFramedSyncTransferDatabase(
            url: directory.appendingPathComponent("inbound.db")
        )
        let receiver = FolioleFramedSyncTransferReceiver(database: database, resourceRoot: attachments)
        let received = try receiver.receive(
            wire, groupKey: Data(repeating: 0, count: 32), context: context()
        )
        let key = try XCTUnwrap(database.rows("""
            SELECT storage_key FROM framed_sync_ios_resource_pins WHERE transfer_id = ?
            """, [received.transferID]).first?[0] as? String)
        XCTAssertEqual(key, Data(SHA256.hash(data: resource)).hex + ".png")
        let resourceFrames = try database.rows("""
            SELECT length(ciphertext), length(authenticated_plaintext) FROM framed_sync_ios_frames
            WHERE frame_type = 4 ORDER BY length(sequence), sequence
            """)
        XCTAssertEqual(resourceFrames.count, 2)
        XCTAssertTrue(resourceFrames.allSatisfy { $0[0] as? Int == 32 && $0[1] as? Int == 32 })

        XCTAssertThrowsError(try receiver.withPublishedResources(
            transferID: received.transferID
        ) { _ -> Void in throw TestFailure.apply })
        XCTAssertFalse(FileManager.default.fileExists(atPath: attachments.appendingPathComponent(key).path))
        let keys = try receiver.withPublishedResources(transferID: received.transferID) { $0 }
        XCTAssertEqual(keys, [key])
        XCTAssertEqual(try Data(contentsOf: attachments.appendingPathComponent(key)), resource)
        XCTAssertFalse(FileManager.default.fileExists(atPath: FolioleFramedSyncResourceFiles.partial(
            root: attachments, transferID: received.transferID,
            attemptID: attempt.attemptID, hash: fact.blobs[0].sha256
        ).path))
    }

    private func makeFact(_ resource: Data) -> Foliole_Sync_V22_FactRecord {
        var blob = Foliole_Sync_V22_BlobReference()
        blob.sha256 = Data(SHA256.hash(data: resource)); blob.byteLength = UInt64(resource.count)
        blob.role = .image; blob.required = true
        var identity = Foliole_Sync_V22_FactIdentity()
        identity.kind = .nodeVersion; identity.objectType = "node"
        identity.globalID = "node-1"; identity.factID = "version-1"
        var fact = Foliole_Sync_V22_FactRecord()
        fact.identity = identity; fact.sharedStateHash = Data(repeating: 1, count: 32)
        fact.body = .init(); fact.blobs = [blob]
        return fact
    }

    private func context() -> FolioleFramedSyncTransferContext {
        .init(groupID: "group", senderDeviceID: "sender", senderLibraryEpoch: "sender-epoch",
              receiverDeviceID: "receiver", receiverLibraryEpoch: "receiver-epoch")
    }
}
