import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncVerifiedBodySpool {
    static func write(
        reference: Foliole_Sync_V22_BlobReference, directory: URL,
        readRange: (UInt64, Int) throws -> Data
    ) throws -> URL {
        guard reference.sha256.count == 32 else { throw invalid() }
        let partial = directory.appendingPathComponent(reference.sha256.hex + ".\(UUID().uuidString).partial")
        let target = directory.appendingPathComponent(reference.sha256.hex)
        guard FileManager.default.createFile(atPath: partial.path, contents: nil) else {
            throw FolioleFramedSyncValidationError("framed_sync_body_spool_unavailable")
        }
        do {
            let handle = try FileHandle(forWritingTo: partial)
            do {
                try writeChunks(reference: reference, handle: handle, readRange: readRange)
                try handle.close()
            } catch {
                try? handle.close()
                throw error
            }
            try FileManager.default.moveItem(at: partial, to: target)
            return target
        } catch {
            try? FileManager.default.removeItem(at: partial)
            throw error
        }
    }

    private static func writeChunks(
        reference: Foliole_Sync_V22_BlobReference, handle: FileHandle,
        readRange: (UInt64, Int) throws -> Data
    ) throws {
        var digest = SHA256()
        var offset: UInt64 = 0
        while offset < reference.byteLength {
            let count = Int(min(512 * 1024, reference.byteLength - offset))
            let bytes = try readRange(offset, count)
            guard bytes.count == count else { throw invalid() }
            digest.update(data: bytes)
            try handle.write(contentsOf: bytes)
            offset += UInt64(count)
        }
        guard Data(digest.finalize()) == reference.sha256 else { throw invalid() }
    }

    private static func invalid() -> FolioleFramedSyncValidationError {
        .init("framed_sync_blob_identity_mismatch")
    }
}
