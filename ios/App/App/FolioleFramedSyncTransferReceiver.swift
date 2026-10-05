import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

struct FolioleFramedSyncReceivedTransfer {
    let transferID: Data
}

final class FolioleFramedSyncTransferReceiver {
    private let database: FolioleFramedSyncTransferDatabase
    var databaseURL: URL { database.url }

    init(database: FolioleFramedSyncTransferDatabase) { self.database = database }

    func receipt(groupKey: Data, value: [String: Any]) throws -> Data {
        try FolioleFramedSyncReceiptWriter.encode(groupKey: groupKey, value: value, database: database)
    }

    func receive(
        _ data: Data, groupKey: Data, context: FolioleFramedSyncTransferContext
    ) throws -> FolioleFramedSyncReceivedTransfer {
        let reader = FolioleFramedSyncStreamReader(input: InputStream(data: data))
        let preamble = try reader.nextPreamble()
        guard preamble.contextKind == 2, preamble.startingSequence == 0 else {
            throw invalid("transfer_preamble_required")
        }
        var transfer = Transfer(preamble: preamble)
        while let frame = try reader.nextFrame() {
            guard transfer.frames.count < 4_130 else { throw invalid("transfer_frame_limit_exceeded") }
            let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(
                groupKey: groupKey, preamble: preamble, frame: frame,
                expectedSequence: UInt64(transfer.frames.count)
            )
            let message = try FolioleFramedSyncCodec.decode(
                plaintext, authenticatedFrameType: frame.header.frameType.rawValue
            )
            try transfer.append(frame, plaintext: plaintext, message: message, context: context)
        }
        try transfer.finish()
        try persist(transfer, context: context)
        return .init(transferID: preamble.contextID)
    }

    private func persist(_ value: Transfer, context: FolioleFramedSyncTransferContext) throws {
        guard let header = value.header else { throw invalid("transfer_header_required") }
        let manifest = header.manifest
        try database.transaction {
            try database.execute("DELETE FROM framed_sync_ios_frames WHERE transfer_id = ?", [value.transferID])
            try database.execute("DELETE FROM framed_sync_ios_blob_pins WHERE transfer_id = ?", [value.transferID])
            try database.execute("DELETE FROM framed_sync_ios_transfers WHERE transfer_id = ?", [value.transferID])
            try database.execute("""
                INSERT INTO framed_sync_ios_transfers VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready_to_apply')
                """, [
                value.transferID, manifest.contentID, manifest.facts.count, manifest.blobs.count,
                manifest.blobs.reduce(UInt64(0)) { $0 + $1.byteLength },
                context.senderDeviceID, context.senderLibraryEpoch,
                context.receiverDeviceID, context.receiverLibraryEpoch, value.attemptID
            ])
            for item in value.frames {
                try database.execute("INSERT INTO framed_sync_ios_frames VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
                    value.transferID, value.attemptID, String(item.frame.header.sequence),
                    Int(item.frame.header.frameType.rawValue), value.preamble.encoded,
                    item.frame.headerBytes, item.frame.ciphertext, item.plaintext
                ])
            }
            for blob in value.blobs {
                try database.execute("INSERT OR IGNORE INTO framed_sync_ios_available_blobs VALUES (?, ?, ?)",
                                     [blob.reference.sha256, blob.reference.byteLength, blob.data])
                try database.execute("INSERT INTO framed_sync_ios_blob_pins VALUES (?, ?, ?, ?, ?)", [
                    value.transferID, blob.reference.sha256, blob.reference.byteLength,
                    Int(blob.reference.role.rawValue), blob.reference.required ? 1 : 0
                ])
            }
        }
    }

    private func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}

private struct Transfer {
    struct Frame { let frame: FolioleFramedSyncWireFrame; let plaintext: Data }
    struct Blob { let reference: Foliole_Sync_V22_BlobReference; let data: Data }
    let preamble: FolioleFramedSyncPreamble
    var header: Foliole_Sync_V22_TransferHeader?
    var facts = [Foliole_Sync_V22_FactRecord]()
    var chunks = [Data: [(UInt64, Data)]]()
    var frames = [Frame]()
    var trailer: Foliole_Sync_V22_TransferTrailer?
    var blobs = [Blob]()
    var transferID: Data { preamble.contextID }
    var attemptID: Data { preamble.identifier }

    mutating func append(
        _ frame: FolioleFramedSyncWireFrame, plaintext: Data,
        message: FolioleFramedSyncValidatedMessage, context: FolioleFramedSyncTransferContext
    ) throws {
        guard trailer == nil else { throw invalid("transfer_trailer_not_final") }
        if frames.isEmpty {
            guard case .transferHeader(let value) = message.payload else {
                throw invalid("transfer_header_required")
            }
            try context.validate(preamble, header: value); header = value
        } else {
            switch message.payload {
            case .fact(let fact): try append(fact)
            case .blobChunk(let chunk): try append(chunk)
            case .transferTrailer(let value): trailer = value
            default: throw invalid("transfer_frame_payload_required")
            }
        }
        frames.append(.init(frame: frame, plaintext: plaintext))
    }

    mutating func finish() throws {
        guard let header, let trailer,
              trailer.transferID == transferID,
              Int(trailer.factCount) == facts.count,
              Int(trailer.factCount) == header.manifest.facts.count,
              Int(trailer.blobCount) == header.manifest.blobs.count else {
            throw invalid("inbound_attempt_manifest_mismatch")
        }
        blobs = try header.manifest.blobs.compactMap(assemble)
        let contentID = try FolioleFramedSyncCanonicalManifest.contentID(
            facts: facts, blobs: header.manifest.blobs
        )
        guard contentID == header.manifest.contentID, contentID == trailer.manifestHash else {
            throw invalid("inbound_attempt_manifest_mismatch")
        }
    }

    private mutating func append(_ fact: Foliole_Sync_V22_FactRecord) throws {
        guard let descriptor = header?.manifest.facts.first(where: { $0.identity == fact.identity }),
              descriptor.sharedStateHash == fact.sharedStateHash else { throw invalid("inbound_fact_undeclared") }
        guard !facts.contains(where: { $0.identity == fact.identity }) else {
            throw invalid("inbound_fact_identity_conflict")
        }
        facts.append(fact)
    }

    private mutating func append(_ chunk: Foliole_Sync_V22_BlobChunk) throws {
        guard chunk.transferID == transferID,
              let reference = header?.manifest.blobs.first(where: { $0.sha256 == chunk.blobHash }),
              chunk.offset <= reference.byteLength,
              UInt64(chunk.data.count) <= reference.byteLength - chunk.offset else {
            throw invalid("blob_chunk_not_admitted")
        }
        chunks[chunk.blobHash, default: []].append((chunk.offset, chunk.data))
    }

    private func assemble(_ reference: Foliole_Sync_V22_BlobReference) throws -> Blob? {
        var data = Data(), expected: UInt64 = 0
        for (offset, chunk) in chunks[reference.sha256, default: []].sorted(by: { $0.0 < $1.0 }) {
            guard offset == expected else { throw invalid("inbound_attempt_manifest_mismatch") }
            data.append(chunk); expected += UInt64(chunk.count)
        }
        if expected == 0 && reference.byteLength > 0 {
            if reference.required { throw invalid("inbound_attempt_manifest_mismatch") }
            return nil
        }
        guard expected == reference.byteLength,
              Data(SHA256.hash(data: data)) == reference.sha256 else {
            throw invalid("inbound_attempt_manifest_mismatch")
        }
        return .init(reference: reference, data: data)
    }

    private func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}
