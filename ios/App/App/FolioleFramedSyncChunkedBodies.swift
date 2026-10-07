import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncChunkedBodies {
    private static let chunkBytes = 512 * 1024
    private let database: FolioleFramedSyncTransferDatabase
    private let frames: FolioleFramedSyncBodyFrameIndex

    init(database: FolioleFramedSyncTransferDatabase, transferID: Data, attemptID: Data) {
        self.database = database
        frames = .init(database: database, transferID: transferID, attemptID: attemptID)
    }

    func verifyAndPromote(_ reference: Foliole_Sync_V22_BlobReference) throws -> Bool {
        if let row = try database.rows("""
            SELECT byte_length FROM framed_sync_ios_available_blobs WHERE sha256 = ? LIMIT 1
            """, [reference.sha256]).first {
            guard let length = row[0] as? Int, length >= 0,
                  UInt64(length) == reference.byteLength else { throw invalid() }
            try verifyAvailable(reference)
            return true
        }
        let entries = try frames.entries(for: reference.sha256)
        guard try verifyReceiving(entries, reference: reference) else { return false }
        try database.execute("INSERT INTO framed_sync_ios_available_blobs (sha256, byte_length) VALUES (?, ?)",
                             [reference.sha256, reference.byteLength])
        try reblock(entries, reference: reference)
        return true
    }

    private func verifyAvailable(_ reference: Foliole_Sync_V22_BlobReference) throws {
        var expected: UInt64 = 0
        var lastOffset: Int?
        var digest = SHA256()
        while let row = try nextAvailable(reference.sha256, after: lastOffset) {
            guard let offset = row[0] as? Int, offset >= 0, UInt64(offset) == expected,
                  expected < reference.byteLength, let bytes = row[1] as? Data,
                  offset % Self.chunkBytes == 0,
                  bytes.count == Int(min(UInt64(Self.chunkBytes), reference.byteLength - expected)) else {
                throw invalid()
            }
            digest.update(data: bytes)
            expected += UInt64(bytes.count)
            lastOffset = offset
        }
        guard expected == reference.byteLength, Data(digest.finalize()) == reference.sha256 else { throw invalid() }
    }

    private func nextAvailable(_ hash: Data, after: Int?) throws -> [Any?]? {
        let cursor = after.map { $0 as Any } ?? NSNull()
        return try database.rows("""
            SELECT byte_offset, CASE WHEN typeof(data) = 'blob'
              AND length(data) BETWEEN 1 AND \(Self.chunkBytes) THEN data ELSE NULL END
            FROM framed_sync_ios_available_blob_chunks
            WHERE sha256 = ? AND (? IS NULL OR byte_offset > ?) ORDER BY byte_offset LIMIT 1
            """, [hash, cursor, cursor]).first
    }

    private func verifyReceiving(
        _ entries: [FolioleFramedSyncBodyFrameIndex.Entry], reference: Foliole_Sync_V22_BlobReference
    ) throws -> Bool {
        var expected: UInt64 = 0
        var digest = SHA256()
        for entry in entries {
            guard entry.offset == expected, expected <= reference.byteLength,
                  UInt64(entry.byteCount) <= reference.byteLength - expected else { throw invalid() }
            let bytes = try frames.data(for: entry, hash: reference.sha256)
            digest.update(data: bytes)
            expected += UInt64(bytes.count)
        }
        if expected == 0 && reference.byteLength > 0 {
            if reference.required { throw invalid() }
            return false
        }
        guard expected == reference.byteLength, Data(digest.finalize()) == reference.sha256 else { throw invalid() }
        return true
    }

    private func reblock(
        _ entries: [FolioleFramedSyncBodyFrameIndex.Entry], reference: Foliole_Sync_V22_BlobReference
    ) throws {
        var buffer = Data()
        buffer.reserveCapacity(Self.chunkBytes)
        var offset: UInt64 = 0
        for entry in entries {
            let bytes = try frames.data(for: entry, hash: reference.sha256)
            var consumed = 0
            while consumed < bytes.count {
                let count = min(Self.chunkBytes - buffer.count, bytes.count - consumed)
                buffer.append(bytes.subdata(in: consumed..<(consumed + count)))
                consumed += count
                if buffer.count == Self.chunkBytes {
                    try write(buffer, hash: reference.sha256, offset: offset)
                    offset += UInt64(buffer.count)
                    buffer.removeAll(keepingCapacity: true)
                }
            }
        }
        if !buffer.isEmpty { try write(buffer, hash: reference.sha256, offset: offset) }
    }

    private func write(_ bytes: Data, hash: Data, offset: UInt64) throws {
        try database.execute("INSERT INTO framed_sync_ios_available_blob_chunks VALUES (?, ?, ?)",
                             [hash, offset, bytes])
    }

    private func invalid() -> FolioleFramedSyncValidationError {
        .init("inbound_attempt_manifest_mismatch")
    }
}
