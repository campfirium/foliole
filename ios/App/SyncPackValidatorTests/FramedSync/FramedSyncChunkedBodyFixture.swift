import CryptoKit
import Foundation
import FolioleFramedSyncRuntime
@testable import FolioleSyncPackValidator

final class FramedSyncChunkedBodyFixture {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("framed-body-\(UUID().uuidString)")
    let transferID = Data(repeating: 1, count: 32)
    let attemptID = Data(repeating: 2, count: 16)
    let database: FolioleFramedSyncTransferDatabase
    var preserveRoot = false

    init() throws {
        database = try .init(url: root.appendingPathComponent("body.db"))
        try database.execute("DROP TABLE framed_sync_ios_available_blobs")
        try database.execute("CREATE TABLE framed_sync_ios_available_blobs (sha256 BLOB PRIMARY KEY, byte_length INTEGER NOT NULL)")
        try database.execute("""
            CREATE TABLE framed_sync_ios_available_blob_chunks (
            sha256 BLOB NOT NULL REFERENCES framed_sync_ios_available_blobs(sha256) ON DELETE CASCADE,
            byte_offset INTEGER NOT NULL CHECK (byte_offset >= 0 AND byte_offset % 524288 = 0),
            data BLOB NOT NULL CHECK (typeof(data) = 'blob' AND length(data) BETWEEN 1 AND 524288),
            PRIMARY KEY (sha256, byte_offset))
            """)
    }

    deinit { if !preserveRoot { try? FileManager.default.removeItem(at: root) } }

    var promoter: FolioleFramedSyncChunkedBodies {
        .init(database: database, transferID: transferID, attemptID: attemptID)
    }

    func reference(_ body: Data, required: Bool = true) -> Foliole_Sync_V22_BlobReference {
        var value = Foliole_Sync_V22_BlobReference()
        value.sha256 = Data(SHA256.hash(data: body))
        value.byteLength = UInt64(body.count)
        value.role = .nodeBody
        value.required = required
        return value
    }

    func stage(_ reference: Foliole_Sync_V22_BlobReference, sequence: Int, offset: UInt64, data: Data) throws {
        var chunk = Foliole_Sync_V22_BlobChunk()
        chunk.transferID = transferID
        chunk.blobHash = reference.sha256
        chunk.offset = offset
        chunk.data = data
        var message = Foliole_Sync_V22_ProtocolMessage()
        message.payload = .blobChunk(chunk)
        let bytes = try FolioleFramedSyncCodec.encode(
            FolioleFramedSyncCodec.validateOutbound(message, authenticatedFrameType: 4)
        )
        try database.execute("INSERT INTO framed_sync_ios_frames VALUES (?, ?, ?, 4, ?, ?, ?, ?)",
                             [transferID, attemptID, String(sequence), Data([1]), Data([1]), Data([1]), bytes])
    }

    func promote(_ reference: Foliole_Sync_V22_BlobReference) throws -> Bool {
        try database.transaction { try promoter.verifyAndPromote(reference) }
    }

    func count(_ table: String) throws -> Int? {
        try database.rows("SELECT count(*) FROM \(table)").first?[0] as? Int
    }
}
