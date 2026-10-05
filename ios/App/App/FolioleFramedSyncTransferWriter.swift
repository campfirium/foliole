import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

struct FolioleFramedSyncOutboundBlob {
    let reference: Foliole_Sync_V22_BlobReference
    let data: Data
}

struct FolioleFramedSyncOutboundAttempt {
    let transferID: Data
    let attemptID: Data
    let preamble: Data
}

enum FolioleFramedSyncTransferWriter {
    private static let blobChunkBytes = 512 * 1024

    static func prepare(
        groupKey: Data, context: FolioleFramedSyncTransferContext,
        facts: [Foliole_Sync_V22_FactRecord], blobs: [FolioleFramedSyncOutboundBlob],
        staging: FolioleFramedSyncOutboundStaging
    ) throws -> FolioleFramedSyncOutboundAttempt {
        let facts = facts.sorted(by: factOrder)
        let blobs = try verifiedBlobs(facts: facts, blobs: blobs)
        let references = blobs.map(\.reference)
        let contentID = try FolioleFramedSyncCanonicalManifest.contentID(facts: facts, blobs: references)
        let transferID = context.deriveTransferID(contentID: contentID)
        let attemptID = randomBytes(count: 16)
        let preamble = try makePreamble(
            transferID: transferID, attemptID: attemptID, noncePrefix: randomBytes(count: 4)
        )
        _ = try staging.prepare(
            transferID: transferID, attemptID: attemptID, preamble: preamble.encoded
        )
        var sequence: UInt64 = 0
        sequence = try persist(
            header(context: context, facts: facts, blobs: references, contentID: contentID,
                   transferID: transferID, attemptID: attemptID),
            type: .transferHeader, sequence: sequence, groupKey: groupKey,
            preamble: preamble, transferID: transferID, attemptID: attemptID, staging: staging
        )
        for fact in facts {
            var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .fact(fact)
            sequence = try persist(
                message, type: .fact, sequence: sequence, groupKey: groupKey,
                preamble: preamble, transferID: transferID, attemptID: attemptID, staging: staging
            )
        }
        for blob in blobs {
            for offset in stride(from: 0, through: max(blob.data.count - 1, 0), by: blobChunkBytes) {
                let end = min(offset + blobChunkBytes, blob.data.count)
                var chunk = Foliole_Sync_V22_BlobChunk()
                chunk.transferID = transferID; chunk.blobHash = blob.reference.sha256
                chunk.offset = UInt64(offset); chunk.data = blob.data[offset..<end]
                var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .blobChunk(chunk)
                sequence = try persist(
                    message, type: .blobChunk, sequence: sequence, groupKey: groupKey,
                    preamble: preamble, transferID: transferID, attemptID: attemptID, staging: staging
                )
            }
        }
        _ = try persist(
            trailer(transferID: transferID, contentID: contentID, facts: facts, blobs: references),
            type: .transferTrailer, sequence: sequence, groupKey: groupKey,
            preamble: preamble, transferID: transferID, attemptID: attemptID, staging: staging
        )
        _ = try staging.finalize(transferID: transferID, attemptID: attemptID)
        return .init(transferID: transferID, attemptID: attemptID, preamble: preamble.encoded)
    }

    static func replay(
        _ attempt: FolioleFramedSyncOutboundAttempt,
        staging: FolioleFramedSyncOutboundStaging
    ) throws -> Data {
        let output = OutputStream.toMemory()
        let writer = FolioleFramedSyncStreamWriter(output: output)
        try writer.write(preamble: attempt.preamble)
        for frame in try staging.replayableFrames(
            transferID: attempt.transferID, attemptID: attempt.attemptID
        ) {
            try writer.write(header: frame.header, ciphertext: frame.ciphertext)
        }
        guard let data = output.property(forKey: .dataWrittenToMemoryStreamKey) as? Data else {
            throw invalid("framed_sync_stream_write_failed")
        }
        return data
    }

    private static func persist(
        _ message: Foliole_Sync_V22_ProtocolMessage, type: FolioleFramedSyncFrameType,
        sequence: UInt64, groupKey: Data, preamble: FolioleFramedSyncPreamble,
        transferID: Data, attemptID: Data, staging: FolioleFramedSyncOutboundStaging
    ) throws -> UInt64 {
        let validated = try FolioleFramedSyncCodec.validateOutbound(
            message, authenticatedFrameType: type.rawValue
        )
        let plaintext = try FolioleFramedSyncCodec.encode(validated)
        let header = try FolioleFramedSyncWireHeader(
            ciphertextBytes: plaintext.count + 16, sequence: sequence, frameType: type
        ).encode()
        let ciphertext = try FolioleFramedSyncFrameCrypto.encrypt(
            groupKey: groupKey, preamble: preamble, header: header,
            plaintext: plaintext, sequence: sequence
        )
        _ = try staging.commit(.init(
            transferID: transferID, attemptID: attemptID, preamble: preamble.encoded,
            header: header, ciphertext: ciphertext, plaintext: plaintext
        ))
        return sequence + 1
    }

    private static func header(
        context: FolioleFramedSyncTransferContext, facts: [Foliole_Sync_V22_FactRecord],
        blobs: [Foliole_Sync_V22_BlobReference], contentID: Data,
        transferID: Data, attemptID: Data
    ) -> Foliole_Sync_V22_ProtocolMessage {
        var manifest = Foliole_Sync_V22_TransferManifest()
        manifest.protocolVersion = 22; manifest.groupID = context.groupID
        manifest.contentID = contentID; manifest.blobs = blobs
        manifest.facts = facts.map { fact in
            var descriptor = Foliole_Sync_V22_FactDescriptor()
            descriptor.identity = fact.identity; descriptor.sharedStateHash = fact.sharedStateHash
            descriptor.requiredBlobHashes = fact.blobs.filter(\.required).map(\.sha256)
            return descriptor
        }
        var value = Foliole_Sync_V22_TransferHeader()
        value.transferID = transferID; value.attemptID = attemptID; value.manifest = manifest
        var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .transferHeader(value)
        return message
    }

    private static func trailer(
        transferID: Data, contentID: Data, facts: [Foliole_Sync_V22_FactRecord],
        blobs: [Foliole_Sync_V22_BlobReference]
    ) -> Foliole_Sync_V22_ProtocolMessage {
        var value = Foliole_Sync_V22_TransferTrailer()
        value.transferID = transferID; value.manifestHash = contentID
        value.factCount = UInt64(facts.count); value.blobCount = UInt64(blobs.count)
        var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .transferTrailer(value)
        return message
    }

    private static func verifiedBlobs(
        facts: [Foliole_Sync_V22_FactRecord], blobs: [FolioleFramedSyncOutboundBlob]
    ) throws -> [FolioleFramedSyncOutboundBlob] {
        var declared = [Data: Foliole_Sync_V22_BlobReference]()
        for reference in facts.flatMap(\.blobs) {
            if let existing = declared[reference.sha256], !sameBlob(existing, reference) {
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
            guard let expected = declared[blob.reference.sha256], sameBlob(expected, blob.reference),
                  blob.reference.byteLength == UInt64(blob.data.count),
                  Data(SHA256.hash(data: blob.data)) == blob.reference.sha256 else {
                throw invalid("framed_sync_blob_content_mismatch")
            }
        }
        return sorted
    }

    private static func sameBlob(
        _ left: Foliole_Sync_V22_BlobReference, _ right: Foliole_Sync_V22_BlobReference
    ) -> Bool {
        left.sha256 == right.sha256 && left.byteLength == right.byteLength &&
            left.role == right.role && left.required == right.required
    }

    private static func makePreamble(
        transferID: Data, attemptID: Data, noncePrefix: Data
    ) throws -> FolioleFramedSyncPreamble {
        var bytes = Data(repeating: 0, count: FolioleFramedSyncPreamble.byteCount)
        bytes.replaceSubrange(0..<8, with: Data("FOLSYNC2".utf8)); bytes[9] = 96
        bytes[11] = 22; bytes[12] = 2
        bytes.replaceSubrange(16..<48, with: transferID)
        bytes.replaceSubrange(48..<64, with: attemptID)
        bytes.replaceSubrange(64..<68, with: noncePrefix)
        return try .init(decoding: bytes)
    }

    private static func randomBytes(count: Int) -> Data {
        Data((0..<count).map { _ in UInt8.random(in: .min ... .max) })
    }

    private static func factOrder(
        _ left: Foliole_Sync_V22_FactRecord, _ right: Foliole_Sync_V22_FactRecord
    ) -> Bool {
        let a = left.identity, b = right.identity
        if a.kind.rawValue != b.kind.rawValue { return a.kind.rawValue < b.kind.rawValue }
        if a.objectType != b.objectType { return a.objectType.utf8.lexicographicallyPrecedes(b.objectType.utf8) }
        if a.globalID != b.globalID { return a.globalID.utf8.lexicographicallyPrecedes(b.globalID.utf8) }
        return a.factID.utf8.lexicographicallyPrecedes(b.factID.utf8)
    }

    private static func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}
