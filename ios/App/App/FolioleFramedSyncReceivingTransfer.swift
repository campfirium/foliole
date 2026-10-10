import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

struct FolioleFramedSyncReceivingTransfer {
    let preamble: FolioleFramedSyncPreamble
    var header: Foliole_Sync_V22_TransferHeader?
    let facts = FolioleFramedSyncReadyFactIndex()
    var bodyFrames = [Data: FolioleFramedSyncBodyFrameIndex.Entry]()
    var frameCount = 0
    var trailer: Foliole_Sync_V22_TransferTrailer?
    var fragmentedFact: FolioleFramedSyncFactFragmentTracker?
    var transferID: Data { preamble.contextID }
    var attemptID: Data { preamble.identifier }

    mutating func append(
        _ frame: FolioleFramedSyncWireFrame, plaintext: Data,
        message: FolioleFramedSyncValidatedMessage, context: FolioleFramedSyncTransferContext
    ) throws {
        guard trailer == nil else { throw invalid("transfer_trailer_not_final") }
        if frameCount == 0 {
            guard case .transferHeader(let value) = message.payload else {
                throw invalid("transfer_header_required")
            }
            try context.validate(preamble, header: value); header = value
        } else {
            if fragmentedFact != nil {
                guard case .factFragment = message.payload else { throw invalid("fact_fragment_incomplete") }
            }
            switch message.payload {
            case .fact(let fact): try append(fact, sequence: frame.header.sequence)
            case .factFragment(let fragment): try append(fragment, sequence: frame.header.sequence)
            case .blobChunk(let chunk): try append(chunk, sequence: frame.header.sequence)
            case .transferTrailer(let value): trailer = value
            default: throw invalid("transfer_frame_payload_required")
            }
        }
        frameCount += 1
    }

    mutating func completeFragment(database: FolioleFramedSyncTransferDatabase) throws {
        guard let fragmentedFact, fragmentedFact.complete else { return }
        let fact = try FolioleFramedSyncDurableFactReader.read(database: database,
            transferID: transferID, attemptID: attemptID, firstSequence: fragmentedFact.firstSequence)
        try append(fact, sequence: fragmentedFact.firstSequence)
        self.fragmentedFact = nil
    }

    private mutating func append(_ fragment: Foliole_Sync_V22_FactFragment, sequence: UInt64) throws {
        guard let descriptor = header?.manifest.facts.first(where: { $0.identity == fragment.identity }),
              descriptor.sharedStateHash == fragment.sharedStateHash else { throw invalid("inbound_fact_undeclared") }
        if fragmentedFact == nil { fragmentedFact = try .init(first: fragment, sequence: sequence) }
        try fragmentedFact!.append(fragment, sequence: sequence)
    }

    mutating func finish(resourceHashes: Set<Data>, database: FolioleFramedSyncTransferDatabase) throws {
        guard fragmentedFact == nil, let header, let trailer,
              trailer.transferID == transferID,
              Int(trailer.factCount) == facts.count,
              Int(trailer.factCount) == header.manifest.facts.count,
              Int(trailer.blobCount) == header.manifest.blobs.count else {
            throw invalid("inbound_attempt_manifest_mismatch")
        }
        let expectedResources = Set(header.manifest.blobs.filter { $0.role != .nodeBody && $0.role != .externalDocument && $0.required }
            .map(\.sha256))
        guard expectedResources.isSubset(of: resourceHashes),
              resourceHashes.isSubset(of: Set(header.manifest.blobs.map(\.sha256))) else {
            throw invalid("inbound_attempt_manifest_mismatch")
        }
        let contentID = try facts.contentID(database: database, transferID: transferID,
            attemptID: attemptID, blobs: header.manifest.blobs)
        guard contentID == header.manifest.contentID, contentID == trailer.manifestHash else {
            throw invalid("inbound_attempt_manifest_mismatch")
        }
    }

    private mutating func append(_ fact: Foliole_Sync_V22_FactRecord, sequence: UInt64) throws {
        guard let descriptor = header?.manifest.facts.first(where: { $0.identity == fact.identity }),
              descriptor.sharedStateHash == fact.sharedStateHash else { throw invalid("inbound_fact_undeclared") }
        try facts.append(fact, sequence: sequence)
    }

    private mutating func append(_ chunk: Foliole_Sync_V22_BlobChunk, sequence: UInt64) throws {
        guard chunk.transferID == transferID,
              let reference = header?.manifest.blobs.first(where: { $0.sha256 == chunk.blobHash }),
              chunk.offset <= reference.byteLength,
              UInt64(chunk.data.count) <= reference.byteLength - chunk.offset else {
            throw invalid("blob_chunk_not_admitted")
        }
        if reference.role == .nodeBody || reference.role == .externalDocument {
            guard reference.byteLength <= 1_048_576, !chunk.data.isEmpty, chunk.offset == 0,
                  UInt64(chunk.data.count) == reference.byteLength,
                  bodyFrames[chunk.blobHash] == nil else { throw invalid("blob_chunk_not_admitted") }
            guard String(data: chunk.data, encoding: .utf8) != nil,
                  Data(SHA256.hash(data: chunk.data)) == reference.sha256 else {
                throw invalid("inbound_attempt_manifest_mismatch")
            }
            bodyFrames[chunk.blobHash] = .init(offset: 0, sequence: String(sequence), byteCount: chunk.data.count)
        }
    }

    private func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}
