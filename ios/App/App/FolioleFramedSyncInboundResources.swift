import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncInboundResources {
    private static let chunkBytes = 512 * 1024
    private let database: FolioleFramedSyncTransferDatabase
    let root: URL

    init(database: FolioleFramedSyncTransferDatabase, root: URL) throws {
        self.database = database; self.root = root
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    func admit(
        transferID: Data, attemptID: Data, blobs: [Foliole_Sync_V22_BlobReference]
    ) throws {
        try database.transaction {
            for blob in blobs {
                let values: [Any] = [transferID, attemptID, blob.sha256, blob.byteLength,
                                     Int(blob.role.rawValue), blob.required ? 1 : 0]
                let row = try database.rows("""
                    SELECT byte_length, role, required FROM framed_sync_ios_blob_offers
                    WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ?
                    """, [transferID, attemptID, blob.sha256]).first
                if let row {
                    guard row[0] as? Int == Int(blob.byteLength),
                          row[1] as? Int == Int(blob.role.rawValue),
                          row[2] as? Int == (blob.required ? 1 : 0) else {
                        throw invalid("blob_offer_identity_conflict")
                    }
                } else {
                    try database.execute("INSERT INTO framed_sync_ios_blob_offers VALUES (?, ?, ?, ?, ?, ?)", values)
                }
            }
        }
    }

    func isResource(transferID: Data, attemptID: Data, hash: Data) throws -> Bool {
        try database.rows("""
            SELECT 1 FROM framed_sync_ios_blob_offers
            WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ? AND role != 1
            """, [transferID, attemptID, hash]).first != nil
    }

    func stage(
        transferID: Data, attemptID: Data, chunk: Foliole_Sync_V22_BlobChunk
    ) throws {
        guard let offer = try database.rows("""
            SELECT byte_length FROM framed_sync_ios_blob_offers
            WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ? AND role != 1
            """, [transferID, attemptID, chunk.blobHash]).first,
              let total = offer[0] as? Int else { throw invalid("blob_chunk_not_admitted") }
        try validateChunk(total: UInt64(total), offset: chunk.offset, length: chunk.data.count)
        let digest = Data(SHA256.hash(data: chunk.data))
        let existing = try database.rows("""
            SELECT byte_length, chunk_sha256 FROM framed_sync_ios_resource_blob_chunks
            WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ? AND byte_offset = ?
            """, [transferID, attemptID, chunk.blobHash, chunk.offset]).first
        if let existing {
            guard existing[0] as? Int == chunk.data.count, existing[1] as? Data == digest else {
                throw invalid("blob_chunk_identity_conflict")
            }
        }
        let file = FolioleFramedSyncResourceFiles.partial(
            root: root, transferID: transferID, attemptID: attemptID, hash: chunk.blobHash
        )
        try write(file, offset: chunk.offset, data: chunk.data, total: UInt64(total))
        if existing == nil {
            try database.execute("""
                INSERT INTO framed_sync_ios_resource_blob_chunks VALUES (?, ?, ?, ?, ?, ?)
                """, [transferID, attemptID, chunk.blobHash, chunk.offset, chunk.data.count, digest])
        }
    }

    func finish(transferID: Data, attemptID: Data) throws -> Set<Data> {
        let offers = try database.rows("""
            SELECT sha256, byte_length, role, required FROM framed_sync_ios_blob_offers
            WHERE transfer_id = ? AND attempt_id = ? AND role != 1
            ORDER BY hex(sha256)
            """, [transferID, attemptID])
        try database.execute("DELETE FROM framed_sync_ios_resource_pins WHERE transfer_id = ?", [transferID])
        var pinned = Set<Data>()
        for row in offers {
            guard let hash = row[0] as? Data, let length = row[1] as? Int,
                  let role = row[2] as? Int, let required = row[3] as? Int else {
                throw invalid("resource_offer_invalid")
            }
            if let key = try verifiedStorageKey(
                transferID: transferID, attemptID: attemptID, hash: hash,
                length: UInt64(length), role: role
            ) {
                try storePin(transferID, hash, length, role, required, key); pinned.insert(hash)
            } else if required == 1 { throw invalid("inbound_attempt_manifest_mismatch") }
        }
        return pinned
    }

    private func verifiedStorageKey(
        transferID: Data, attemptID: Data, hash: Data, length: UInt64, role: Int
    ) throws -> String? {
        if let available = try database.rows("""
            SELECT byte_length, storage_key FROM framed_sync_ios_available_resources WHERE sha256 = ?
            """, [hash]).first, let storedLength = available[0] as? Int,
           let key = available[1] as? String {
            guard storedLength == Int(length) else { throw invalid("resource_available_identity_conflict") }
            if try FolioleFramedSyncResourceFiles.verify(
                root.appendingPathComponent(key), expectedHash: hash,
                expectedLength: length, role: role
            ) == key { return key }
        }
        guard try chunksComplete(
            transferID: transferID, attemptID: attemptID, hash: hash, length: length
        ) else { return nil }
        let partial = FolioleFramedSyncResourceFiles.partial(
            root: root, transferID: transferID, attemptID: attemptID, hash: hash
        )
        guard let key = try FolioleFramedSyncResourceFiles.verify(
            partial, expectedHash: hash, expectedLength: length, role: role
        ) else { return nil }
        try database.execute("INSERT OR IGNORE INTO framed_sync_ios_available_resources VALUES (?, ?, ?)",
                             [hash, length, key])
        let stored = try database.rows("""
            SELECT byte_length, storage_key FROM framed_sync_ios_available_resources WHERE sha256 = ?
            """, [hash]).first
        guard stored?[0] as? Int == Int(length), stored?[1] as? String == key else {
            throw invalid("resource_available_identity_conflict")
        }
        return key
    }

    private func chunksComplete(
        transferID: Data, attemptID: Data, hash: Data, length: UInt64
    ) throws -> Bool {
        let rows = try database.rows("""
            SELECT byte_offset, byte_length FROM framed_sync_ios_resource_blob_chunks
            WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ? ORDER BY byte_offset
            """, [transferID, attemptID, hash])
        var offset: UInt64 = 0
        for row in rows {
            guard row[0] as? Int == Int(offset), let count = row[1] as? Int else { return false }
            offset += UInt64(count)
        }
        return offset == length
    }

    private func storePin(
        _ transferID: Data, _ hash: Data, _ length: Int, _ role: Int,
        _ required: Int, _ key: String
    ) throws {
        try database.execute("""
            INSERT INTO framed_sync_ios_resource_pins VALUES (?, ?, ?, ?, ?, ?)
            """, [transferID, hash, length, role, required, key])
    }

    private func validateChunk(total: UInt64, offset: UInt64, length: Int) throws {
        guard offset <= total, offset % UInt64(Self.chunkBytes) == 0,
              length == min(Self.chunkBytes, Int(total - offset)) else {
            throw invalid("blob_chunk_range_invalid")
        }
    }

    private func write(_ url: URL, offset: UInt64, data: Data, total: UInt64) throws {
        if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: nil)
        }
        let handle = try FileHandle(forWritingTo: url); defer { try? handle.close() }
        try handle.seek(toOffset: offset); try handle.write(contentsOf: data)
        if offset + UInt64(data.count) == total { try handle.truncate(atOffset: total) }
    }

    private func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}
