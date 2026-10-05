import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncOutboundBlobVerifier {
    static func verify(
        facts: [Foliole_Sync_V22_FactRecord], blobs: [FolioleFramedSyncOutboundBlob],
        chunkBytes: Int
    ) throws -> [FolioleFramedSyncOutboundBlob] {
        var declared = [Data: Foliole_Sync_V22_BlobReference]()
        for reference in facts.flatMap(\.blobs) {
            if let existing = declared[reference.sha256], !same(existing, reference) {
                throw invalid("framed_sync_blob_identity_conflict")
            }
            declared[reference.sha256] = reference
        }
        guard declared.count == blobs.count else { throw invalid("framed_sync_blob_set_mismatch") }
        let sorted = blobs.sorted { $0.reference.sha256.lexicographicallyPrecedes($1.reference.sha256) }
        guard Set(declared.keys) == Set(sorted.map(\.reference.sha256)),
              Set(sorted.map(\.reference.sha256)).count == sorted.count else {
            throw invalid("framed_sync_blob_set_mismatch")
        }
        for blob in sorted {
            let identity = try sourceIdentity(blob.source, chunkBytes: chunkBytes)
            guard let expected = declared[blob.reference.sha256], same(expected, blob.reference),
                  blob.reference.byteLength == identity.0,
                  blob.reference.sha256 == identity.1 else {
                throw invalid("framed_sync_blob_content_mismatch")
            }
        }
        return sorted
    }

    private static func sourceIdentity(
        _ source: FolioleFramedSyncOutboundBlob.Source, chunkBytes: Int
    ) throws -> (UInt64, Data) {
        switch source {
        case .data(let data): return (UInt64(data.count), Data(SHA256.hash(data: data)))
        case .file(let url):
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            var count: UInt64 = 0, hasher = SHA256()
            while let value = try handle.read(upToCount: chunkBytes), !value.isEmpty {
                count += UInt64(value.count); hasher.update(data: value)
            }
            return (count, Data(hasher.finalize()))
        }
    }

    private static func same(
        _ left: Foliole_Sync_V22_BlobReference, _ right: Foliole_Sync_V22_BlobReference
    ) -> Bool {
        left.sha256 == right.sha256 && left.byteLength == right.byteLength &&
            left.role == right.role && left.required == right.required
    }

    private static func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}
