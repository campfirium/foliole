import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncFrozenBodySpool {
    static func write(
        reference: Foliole_Sync_V22_BlobReference, directory: URL,
        readBody: () throws -> Data
    ) throws -> URL {
        guard reference.sha256.count == 32, reference.byteLength <= 1_048_576 else { throw invalid() }
        let partial = directory.appendingPathComponent(reference.sha256.hex + ".\(UUID().uuidString).partial")
        let target = directory.appendingPathComponent(reference.sha256.hex)
        guard FileManager.default.createFile(atPath: partial.path, contents: nil) else {
            throw FolioleFramedSyncValidationError("framed_sync_body_spool_unavailable")
        }
        do {
            let handle = try FileHandle(forWritingTo: partial)
            do {
                let bytes = try readBody()
                guard UInt64(bytes.count) == reference.byteLength,
                      Data(SHA256.hash(data: bytes)) == reference.sha256 else { throw invalid() }
                try handle.write(contentsOf: bytes)
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

    private static func invalid() -> FolioleFramedSyncValidationError {
        .init("framed_sync_blob_identity_mismatch")
    }
}
