import CryptoKit
import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FolioleFramedSyncExternalDocumentTests: XCTestCase {
    func testOriginalExternalDocumentBodyUsesInlineStagingAndSurvivesReopen() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-role5-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let body = Data("Original external document 🌿".utf8)
        var reference = Foliole_Sync_V22_BlobReference()
        reference.sha256 = Data(SHA256.hash(data: body))
        reference.byteLength = UInt64(body.count)
        reference.role = .externalDocument
        reference.required = true
        var identity = Foliole_Sync_V22_FactIdentity()
        identity.kind = .objectState
        identity.objectType = "external_document"
        identity.globalID = "original-document"
        identity.factID = "external_document:" + Data(repeating: 1, count: 32).hex
        var fact = Foliole_Sync_V22_FactRecord()
        fact.identity = identity
        fact.sharedStateHash = Data(repeating: 1, count: 32)
        fact.body = .init()
        fact.blobs = [reference]
        let digest = Data(repeating: 2, count: 32).hex
        let prepared = try FolioleCompanionFramedSyncPreparedOutbound.decode([
            "blobs": [["sha256": reference.sha256.hex, "byte_length": String(body.count),
                       "role": 5, "required": true, "data_text": String(decoding: body, as: UTF8.self)]],
            "content_id": digest, "manifest_hash": digest,
            "transfer_id": digest, "header_message_bytes": try FramedSyncPreparedOutboundFixture.headerBytes(
                facts: [fact], contentID: Data(repeating: 2, count: 32), transferID: Data(repeating: 2, count: 32))
        ])
        let context = FolioleFramedSyncTransferContext(groupID: "group", senderDeviceID: "sender",
            senderLibraryEpoch: "sender-epoch", receiverDeviceID: "receiver", receiverLibraryEpoch: "receiver-epoch")
        let sender = try FolioleFramedSyncOutboundSQLite(database: .init(url: root.appendingPathComponent("sender.db")))
        let key = Data(repeating: 0, count: 32)
        let attempt = try FolioleFramedSyncTransferWriter.prepare(groupKey: key, context: context,
            facts: [fact], blobs: prepared.blobs, staging: sender)
        let wire = try FolioleFramedSyncTransferWriter.replay(attempt, staging: sender)
        let url = root.appendingPathComponent("receiver.db")
        let receiver = FolioleFramedSyncTransferReceiver(database: try .init(url: url), resourceRoot: root)
        XCTAssertEqual(try receiver.receive(wire, groupKey: key, context: context).transferID, attempt.transferID)
        let reopened = try FolioleFramedSyncTransferDatabase(url: url)
        XCTAssertEqual(try reopened.rows("SELECT data FROM framed_sync_ios_available_blobs").first?[0] as? Data, body)
        XCTAssertEqual(try reopened.rows("SELECT role FROM framed_sync_ios_blob_pins").first?[0] as? Int, 5)
        XCTAssertTrue(try reopened.rows("SELECT 1 FROM framed_sync_ios_resource_pins").isEmpty)
        XCTAssertEqual(try reopened.rows("SELECT state FROM framed_sync_ios_transfers").first?[0] as? String, "ready_to_apply")
    }
}
