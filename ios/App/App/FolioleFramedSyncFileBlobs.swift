import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

struct FolioleFramedSyncFileBlobs {
    let files: FolioleFramedSyncFiles
    let root: URL
    let transferID: Data
    let attemptID: Data

    func stage(_ chunk: Foliole_Sync_V22_BlobChunk, header: Foliole_Sync_V22_TransferHeader) throws {
        guard let blob = header.manifest.blobs.first(where: { $0.sha256 == chunk.blobHash }) else {
            throw invalid("blob_chunk_not_admitted")
        }
        if blob.role == .nodeBody || blob.role == .externalDocument {
            try validateBody(chunk.data, blob: blob)
            guard chunk.offset == 0 else { throw invalid("blob_chunk_range_invalid") }
            try files.write(bodyPath(blob.sha256), data: chunk.data)
            return
        }
        guard chunk.offset <= blob.byteLength, chunk.offset % 524_288 == 0,
              UInt64(chunk.data.count) == min(524_288, blob.byteLength - chunk.offset) else {
            throw invalid("blob_chunk_range_invalid")
        }
        let record: [String: Any] = ["offset": String(chunk.offset), "byteLength": String(chunk.data.count),
            "sha256": Array(SHA256.hash(data: chunk.data))]
        let key = try directory() + "/resource-chunks/\(blob.sha256.hex)/\(chunk.offset).json"
        if let prior = try FolioleFramedSyncFileRecords.read(files, key),
           !FolioleFramedSyncFileRecords.same(prior, record) { throw invalid("blob_chunk_identity_conflict") }
        let url = partial(blob.sha256)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        if !FileManager.default.fileExists(atPath: url.path) { FileManager.default.createFile(atPath: url.path, contents: nil) }
        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        try handle.seek(toOffset: chunk.offset)
        try handle.write(contentsOf: chunk.data)
        if chunk.offset + UInt64(chunk.data.count) == blob.byteLength { try handle.truncate(atOffset: blob.byteLength) }
        try handle.synchronize()
        try files.syncDirectory(root)
        try FolioleFramedSyncFileRecords.write(files, key, record)
    }

    func finish(_ header: Foliole_Sync_V22_TransferHeader) throws -> Set<Data> {
        var resources = Set<Data>()
        for blob in header.manifest.blobs {
            var pin = FolioleFramedSyncFileRecords.blob(blob)
            if blob.role == .nodeBody || blob.role == .externalDocument {
                let data = try files.read(bodyPath(blob.sha256)) ?? (blob.byteLength == 0 ? Data() : nil)
                guard let data else {
                    if blob.required { throw invalid("required_blob_unavailable") }
                    continue
                }
                try validateBody(data, blob: blob)
                try files.write(bodyPath(blob.sha256), data: data)
            } else {
                guard try complete(blob), let key = try FolioleFramedSyncResourceFiles.verify(
                    partial(blob.sha256), expectedHash: blob.sha256, expectedLength: blob.byteLength,
                    role: blob.role.rawValue) else {
                    if blob.required { throw invalid("inbound_attempt_manifest_mismatch") }
                    continue
                }
                pin["storageKey"] = key
                resources.insert(blob.sha256)
            }
            try FolioleFramedSyncFileRecords.write(files, directory() + "/pins/\(blob.sha256.hex).json", pin)
        }
        return resources
    }

    private func complete(_ blob: Foliole_Sync_V22_BlobReference) throws -> Bool {
        var offset: UInt64 = 0
        while offset < blob.byteLength {
            let key = try directory() + "/resource-chunks/\(blob.sha256.hex)/\(offset).json"
            guard let record = try FolioleFramedSyncFileRecords.read(files, key),
                  record["offset"] as? String == String(offset),
                  let raw = record["byteLength"] as? String, let count = UInt64(raw),
                  UInt64(count) == min(524_288, blob.byteLength - offset) else { return false }
            offset += UInt64(count)
        }
        return true
    }

    func discardResources(_ header: Foliole_Sync_V22_TransferHeader) {
        for blob in header.manifest.blobs where blob.role != .nodeBody && blob.role != .externalDocument {
            try? FileManager.default.removeItem(at: partial(blob.sha256))
        }
    }

    private func validateBody(_ data: Data, blob: Foliole_Sync_V22_BlobReference) throws {
        guard blob.byteLength <= 1_048_576, UInt64(data.count) == blob.byteLength,
              String(data: data, encoding: .utf8) != nil, Data(SHA256.hash(data: data)) == blob.sha256 else {
            throw invalid("inbound_attempt_manifest_mismatch")
        }
    }

    private func directory() throws -> String { try FolioleFramedSyncFileRecords.attempt(transferID, attemptID) }
    private func bodyPath(_ hash: Data) throws -> String { try directory() + "/bodies/\(hash.hex).body" }
    private func partial(_ hash: Data) -> URL {
        FolioleFramedSyncResourceFiles.partial(root: root, transferID: transferID, attemptID: attemptID, hash: hash)
    }
    private func invalid(_ code: String) -> Error { FolioleFramedSyncValidationError(code) }
}
