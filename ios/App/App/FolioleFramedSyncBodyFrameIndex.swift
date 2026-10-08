import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncBodyFrameIndex {
    struct Entry {
        let offset: UInt64
        let sequence: String
        let byteCount: Int
    }

    private let database: FolioleFramedSyncTransferDatabase
    private let transferID: Data
    private let attemptID: Data

    init(database: FolioleFramedSyncTransferDatabase, transferID: Data, attemptID: Data) {
        self.database = database
        self.transferID = transferID
        self.attemptID = attemptID
    }

    func data(for entry: Entry, hash: Data) throws -> Data {
        let row = try database.rows("""
            SELECT CASE WHEN typeof(authenticated_plaintext) = 'blob'
              AND length(authenticated_plaintext) <= \(FolioleFramedSyncLimits.maxFrameMessageBytes)
              THEN authenticated_plaintext ELSE NULL END FROM framed_sync_ios_frames
            WHERE transfer_id = ? AND attempt_id = ? AND frame_type = 4 AND sequence = ? LIMIT 1
            """, [transferID, attemptID, entry.sequence]).first
        guard let bytes = row?[0] as? Data else { throw invalid() }
        let chunk = try decode(bytes)
        guard chunk.blobHash == hash, chunk.offset == entry.offset,
              chunk.data.count == entry.byteCount else { throw invalid() }
        return chunk.data
    }

    private func decode(_ bytes: Data) throws -> Foliole_Sync_V22_BlobChunk {
        do {
            let message = try FolioleFramedSyncCodec.decode(bytes, authenticatedFrameType: 4)
            guard case .blobChunk(let chunk) = message.payload,
                  chunk.transferID == transferID else { throw invalid() }
            return chunk
        } catch { throw invalid() }
    }

    private func invalid() -> FolioleFramedSyncValidationError {
        .init("inbound_attempt_manifest_mismatch")
    }
}
