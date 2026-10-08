import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncReadyFactIndex {
    private struct Entry {
        let identity: Foliole_Sync_V22_FactIdentity
        let sequence: String
    }
    private var entries = [Entry]()
    var count: Int { entries.count }

    func append(_ fact: Foliole_Sync_V22_FactRecord, sequence: UInt64) throws {
        guard !entries.contains(where: { $0.identity == fact.identity }) else {
            throw FolioleFramedSyncValidationError("inbound_fact_identity_conflict")
        }
        entries.append(.init(identity: fact.identity, sequence: String(sequence)))
    }

    func contentID(database: FolioleFramedSyncTransferDatabase, transferID: Data, attemptID: Data,
                   blobs: [Foliole_Sync_V22_BlobReference]) throws -> Data {
        let ordered = entries.sorted {
            FolioleFramedSyncCanonicalManifest.identityOrder($0.identity, $1.identity)
        }
        return try FolioleFramedSyncCanonicalManifest.contentID(orderedFactCount: ordered.count, blobs: blobs) { index in
            let entry = ordered[index]
            let fact = try FolioleFramedSyncDurableFactReader.read(database: database, transferID: transferID,
                attemptID: attemptID, firstSequence: UInt64(entry.sequence)!)
            guard fact.identity == entry.identity else { throw invalid() }
            return fact
        }
    }

    private func invalid() -> FolioleFramedSyncValidationError {
        .init("canonical_fact_source_changed")
    }
}

enum FolioleFramedSyncDurableFactReader {
    static func read(database: FolioleFramedSyncTransferDatabase, transferID: Data, attemptID: Data,
                     firstSequence: UInt64) throws -> Foliole_Sync_V22_FactRecord {
        var sequence = firstSequence
        var tracker: FolioleFramedSyncFactFragmentTracker?
        var bytes = Data()
        while true {
            let row = try database.rows("""
                SELECT CASE WHEN typeof(authenticated_plaintext) = 'blob'
                  AND length(authenticated_plaintext) <= \(FolioleFramedSyncLimits.maxFrameMessageBytes)
                  THEN authenticated_plaintext ELSE NULL END FROM framed_sync_ios_frames
                WHERE transfer_id = ? AND attempt_id = ? AND frame_type = 3 AND sequence = ? LIMIT 1
                """, [transferID, attemptID, String(sequence)]).first
            guard let plaintext = row?[0] as? Data else { throw invalid() }
            let message = try FolioleFramedSyncCodec.decode(plaintext, authenticatedFrameType: 3)
            if case .fact(let fact) = message.payload {
                guard tracker == nil else { throw invalid() }
                return fact
            }
            guard case .factFragment(let fragment) = message.payload else { throw invalid() }
            if tracker == nil { tracker = try .init(first: fragment, sequence: sequence) }
            try tracker!.append(fragment, sequence: sequence)
            bytes.append(fragment.data)
            if tracker!.complete {
                guard Data(SHA256.hash(data: bytes)) == tracker!.encodedSHA256 else { throw invalid() }
                let complete = try FolioleFramedSyncCodec.decodeCompletedFact(bytes)
                guard case .fact(let fact) = complete.payload, fact.identity == tracker!.identity,
                      fact.sharedStateHash == tracker!.sharedStateHash else { throw invalid() }
                return fact
            }
            sequence += 1
        }
    }

    private static func invalid() -> FolioleFramedSyncValidationError {
        .init("canonical_fact_source_changed")
    }
}
