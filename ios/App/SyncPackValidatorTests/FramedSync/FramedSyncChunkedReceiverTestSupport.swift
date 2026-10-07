import CryptoKit
import Foundation
import XCTest
@testable import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

enum FramedSyncChunkedReceiverFixture {
    static let key = Data(0...31)
    static let chunkBytes = 512 * 1024

    struct Publication {
        let context: FolioleFramedSyncTransferContext
        let attempt: FolioleFramedSyncOutboundAttempt
        let reference: Foliole_Sync_V22_BlobReference
        let wire: Data
    }

    static func largeBody() -> Data {
        Data(("\u{feff}" + String(repeating: "正文🌿\0", count: 320_000)).utf8)
    }

    static func withRoot(_ operation: (URL) throws -> Void) throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-chunked-\(UUID())")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try operation(root)
    }

    static func database(_ root: URL) throws -> FolioleFramedSyncTransferDatabase {
        let database = try FolioleFramedSyncTransferDatabase(url: root.appendingPathComponent("receiver.db"))
        try database.transaction {
            try database.execute("DROP TABLE framed_sync_ios_available_blobs")
            try database.execute("""
                CREATE TABLE framed_sync_ios_available_blobs (
                sha256 BLOB PRIMARY KEY, byte_length INTEGER NOT NULL)
                """)
            try database.execute("""
                CREATE TABLE framed_sync_ios_available_blob_chunks (
                sha256 BLOB NOT NULL,
                byte_offset INTEGER NOT NULL CHECK (byte_offset >= 0 AND byte_offset % 524288 = 0),
                data BLOB NOT NULL CHECK (typeof(data) = 'blob' AND length(data) BETWEEN 1 AND 524288),
                PRIMARY KEY (sha256, byte_offset),
                FOREIGN KEY (sha256) REFERENCES framed_sync_ios_available_blobs(sha256) ON DELETE CASCADE)
                """)
        }
        return database
    }

    static func publication(
        _ root: URL, body: Data, role: Foliole_Sync_V22_BlobRole, epoch: String = "epoch-a"
    ) throws -> Publication {
        var reference = Foliole_Sync_V22_BlobReference()
        reference.sha256 = Data(SHA256.hash(data: body)); reference.byteLength = UInt64(body.count)
        reference.role = role; reference.required = true
        var identity = Foliole_Sync_V22_FactIdentity()
        identity.kind = role == .nodeBody ? .nodeVersion : .objectState
        identity.objectType = role == .nodeBody ? "node" : "external_document"
        identity.globalID = "original-body"; identity.factID = "original-version"
        var fact = Foliole_Sync_V22_FactRecord()
        fact.identity = identity; fact.sharedStateHash = Data(repeating: 1, count: 32)
        fact.body = .init(); fact.blobs = [reference]
        let context = FolioleFramedSyncTransferContext(groupID: "group-a", senderDeviceID: "ios-a",
            senderLibraryEpoch: epoch, receiverDeviceID: "ios-b", receiverLibraryEpoch: "epoch-b")
        let source = try FolioleFramedSyncTransferDatabase(url: root.appendingPathComponent("sender-\(epoch).db"))
        let staging = try FolioleFramedSyncOutboundSQLite(database: source)
        let attempt = try FolioleFramedSyncTransferWriter.prepare(groupKey: key, context: context,
            facts: [fact], blobs: [.init(reference: reference, data: body)], staging: staging)
        // The production Data replay is fixture generation, not evidence of bounded sender memory.
        let wire = try FolioleFramedSyncTransferWriter.replay(attempt, staging: staging)
        return .init(context: context, attempt: attempt, reference: reference, wire: wire)
    }

    static func receive(_ publication: Publication, database: FolioleFramedSyncTransferDatabase, root: URL) throws {
        let receiver = FolioleFramedSyncTransferReceiver(database: database, resourceRoot: root, chunkedBodies: true)
        let received = try receiver.receive(publication.wire, groupKey: key, context: publication.context)
        XCTAssertEqual(received.transferID, publication.attempt.transferID)
    }

    static func assertBody(
        _ body: Data, publication: Publication, database: FolioleFramedSyncTransferDatabase
    ) throws {
        let hash = publication.reference.sha256
        XCTAssertEqual(try database.rows("SELECT byte_length FROM framed_sync_ios_available_blobs WHERE sha256 = ?",
            [hash]).first?[0] as? Int, body.count)
        var offset = 0
        var digest = SHA256()
        while let row = try database.rows("""
            SELECT byte_offset, data FROM framed_sync_ios_available_blob_chunks
            WHERE sha256 = ? AND byte_offset >= ? ORDER BY byte_offset LIMIT 1
            """, [hash, offset]).first {
            let bytes = try XCTUnwrap(row[1] as? Data)
            XCTAssertEqual(row[0] as? Int, offset)
            XCTAssertEqual(bytes.count, min(chunkBytes, body.count - offset))
            XCTAssertEqual(bytes, body.subdata(in: offset..<(offset + bytes.count)))
            digest.update(data: bytes); offset += bytes.count
        }
        XCTAssertEqual(offset, body.count)
        XCTAssertEqual(Data(digest.finalize()), hash)
        XCTAssertEqual(try database.rows("SELECT role FROM framed_sync_ios_blob_pins WHERE transfer_id = ?",
            [publication.attempt.transferID]).first?[0] as? Int, Int(publication.reference.role.rawValue))
    }

    static func receipt(_ publication: Publication, database: FolioleFramedSyncTransferDatabase) throws {
        let contentID = try XCTUnwrap(try database.rows(
            "SELECT content_id FROM framed_sync_ios_transfers WHERE transfer_id = ?",
            [publication.attempt.transferID]).first?[0] as? Data)
        let wire = try FolioleFramedSyncReceiptWriter.encode(groupKey: key, value: [
            "transfer_id": publication.attempt.transferID.hex, "content_id": contentID.hex,
            "applied_state_hash": Data(repeating: 2, count: 32).hex,
            "receiver_device_id": "ios-b", "receiver_library_epoch": "epoch-b"
        ], database: database)
        let receipt = try FolioleFramedSyncReceiptReader.read(wire, groupKey: key,
            transferID: publication.attempt.transferID, contentID: contentID,
            receiverDeviceID: "ios-b", receiverLibraryEpoch: "epoch-b")
        XCTAssertEqual(receipt.appliedStateHash, Data(repeating: 2, count: 32))
    }
}
