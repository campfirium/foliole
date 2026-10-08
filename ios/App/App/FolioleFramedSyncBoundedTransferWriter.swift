import Foundation
import FolioleFramedSyncRuntime

extension FolioleFramedSyncTransferWriter {
    static func persistEncoded(
        _ plaintext: Data, type: FolioleFramedSyncFrameType, sequence: UInt64, groupKey: Data,
        preamble: FolioleFramedSyncPreamble, transferID: Data, attemptID: Data,
        staging: FolioleFramedSyncOutboundStaging
    ) throws -> UInt64 {
        _ = try FolioleFramedSyncCodec.decode(plaintext, authenticatedFrameType: type.rawValue)
        let header = try FolioleFramedSyncWireHeader(
            ciphertextBytes: plaintext.count + 16, sequence: sequence, frameType: type).encode()
        let ciphertext = try FolioleFramedSyncFrameCrypto.encrypt(groupKey: groupKey, preamble: preamble,
            header: header, plaintext: plaintext, sequence: sequence)
        _ = try staging.commit(.init(transferID: transferID, attemptID: attemptID, preamble: preamble.encoded,
            header: header, ciphertext: ciphertext, plaintext: plaintext))
        return sequence + 1
    }

    /** Production sender: one complete fact for canonical verification, then one frozen wire frame at a time. */
    static func prepare(
        groupKey: Data, context: FolioleFramedSyncTransferContext,
        prepared: FolioleCompanionFramedSyncPreparedOutbound,
        source: FolioleFramedSyncOutboundFactSource, staging: FolioleFramedSyncOutboundStaging
    ) throws -> FolioleFramedSyncOutboundAttempt {
        guard prepared.header.manifest.groupID == context.groupID,
              context.deriveTransferID(contentID: prepared.contentID) == prepared.transferID,
              source.header == prepared.header else { throw boundedInvalid() }
        let blobs = try FolioleFramedSyncOutboundBlobVerifier.verify(
            references: prepared.header.manifest.blobs, blobs: prepared.blobs, chunkBytes: 512 * 1024, owner: source.owner)
        let indices = source.orderedIndices
        let contentID = try FolioleFramedSyncCanonicalManifest.contentID(orderedFactCount: indices.count,
            blobs: blobs.map(\.reference)) { try source.fact(at: indices[$0]) }
        guard contentID == prepared.contentID else { throw boundedInvalid() }
        let attemptID = randomBytes(count: 16)
        let preamble = try makePreamble(transferID: prepared.transferID, attemptID: attemptID,
            noncePrefix: randomBytes(count: 4))
        _ = try staging.prepare(transferID: prepared.transferID, attemptID: attemptID, preamble: preamble.encoded)
        var header = prepared.header; header.attemptID = attemptID
        var message = Foliole_Sync_V22_ProtocolMessage(); message.payload = .transferHeader(header)
        var sequence = try FolioleFramedSyncPayloadWorker.withLoan(source.owner, direction: .outbound) { _ in
            try persist(message, type: .transferHeader, sequence: 0, groupKey: groupKey,
                preamble: preamble, transferID: prepared.transferID, attemptID: attemptID, staging: staging)
        }
        for index in indices {
            try source.forEachMessage(at: index) { bytes, _ in
                sequence = try persistEncoded(bytes, type: .fact, sequence: sequence, groupKey: groupKey,
                    preamble: preamble, transferID: prepared.transferID, attemptID: attemptID, staging: staging)
            }
        }
        for blob in blobs {
            sequence = try persistBlob(blob, sequence: sequence, groupKey: groupKey, preamble: preamble,
                transferID: prepared.transferID, attemptID: attemptID, staging: staging, owner: source.owner)
        }
        var trailer = Foliole_Sync_V22_TransferTrailer()
        trailer.transferID = prepared.transferID; trailer.manifestHash = contentID
        trailer.factCount = UInt64(indices.count); trailer.blobCount = UInt64(blobs.count)
        message.payload = .transferTrailer(trailer)
        _ = try FolioleFramedSyncPayloadWorker.withLoan(source.owner, direction: .outbound) { _ in
            try persist(message, type: .transferTrailer, sequence: sequence, groupKey: groupKey,
                preamble: preamble, transferID: prepared.transferID, attemptID: attemptID, staging: staging)
        }
        _ = try staging.finalize(transferID: prepared.transferID, attemptID: attemptID)
        return .init(transferID: prepared.transferID, attemptID: attemptID, preamble: preamble.encoded)
    }

    private static func boundedInvalid() -> FolioleFramedSyncValidationError {
        .init("framed_sync_transfer_identity_mismatch")
    }
}
