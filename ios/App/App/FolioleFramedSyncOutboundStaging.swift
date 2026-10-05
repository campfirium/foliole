import Foundation
import FolioleFramedSyncRuntime

protocol FolioleFramedSyncOutboundStaging {
    func prepare(transferID: Data, attemptID: Data, preamble: Data) throws -> FolioleFramedSyncStageOutcome
    func commit(_ frame: FolioleFramedSyncAuthenticatedFrame) throws -> FolioleFramedSyncStageOutcome
    func finalize(transferID: Data, attemptID: Data) throws -> FolioleFramedSyncStageOutcome
    func replayableFrames(transferID: Data, attemptID: Data) throws -> [FolioleFramedSyncAuthenticatedFrame]
}

final class FolioleFramedSyncOutboundSQLite: FolioleFramedSyncOutboundStaging {
    private let database: FolioleFramedSyncTransferDatabase

    init(database: FolioleFramedSyncTransferDatabase) { self.database = database }

    func prepare(
        transferID: Data, attemptID: Data, preamble: Data
    ) throws -> FolioleFramedSyncStageOutcome {
        try requireBinding(transferID: transferID, attemptID: attemptID, encodedPreamble: preamble)
        return try database.transaction {
            let rows = try database.rows("""
                SELECT preamble FROM framed_sync_ios_outbound_attempts
                WHERE transfer_id = ? AND attempt_id = ?
                """, [transferID, attemptID])
            if let row = rows.first {
                guard row[0] as? Data == preamble else { throw invalid("outbound_attempt_identity_conflict") }
                return .identical
            }
            try database.execute("""
                INSERT INTO framed_sync_ios_outbound_attempts VALUES (?, ?, ?, 'prepared')
                """, [transferID, attemptID, preamble])
            return .created
        }
    }

    func commit(
        _ frame: FolioleFramedSyncAuthenticatedFrame
    ) throws -> FolioleFramedSyncStageOutcome {
        try requireBinding(
            transferID: frame.transferID, attemptID: frame.attemptID, encodedPreamble: frame.preamble
        )
        let header = try FolioleFramedSyncWireHeader(decoding: frame.header)
        return try database.transaction {
            let attempt = try database.rows("""
                SELECT preamble, state FROM framed_sync_ios_outbound_attempts
                WHERE transfer_id = ? AND attempt_id = ?
                """, [frame.transferID, frame.attemptID]).first
            guard attempt?[0] as? Data == frame.preamble,
                  attempt?[1] as? String == "prepared" else {
                throw invalid("outbound_attempt_not_prepared")
            }
            let rows = try database.rows("""
                SELECT frame_header, ciphertext, authenticated_plaintext
                FROM framed_sync_ios_outbound_frames
                WHERE transfer_id = ? AND attempt_id = ? AND sequence = ?
                """, [frame.transferID, frame.attemptID, String(header.sequence)])
            if let row = rows.first {
                guard row[0] as? Data == frame.header,
                      row[1] as? Data == frame.ciphertext,
                      row[2] as? Data == frame.plaintext else {
                    throw invalid("outbound_frame_identity_conflict")
                }
                return .identical
            }
            try database.execute("""
                INSERT INTO framed_sync_ios_outbound_frames VALUES (?, ?, ?, ?, ?, ?)
                """, [frame.transferID, frame.attemptID, String(header.sequence),
                        frame.header, frame.ciphertext, frame.plaintext])
            return .created
        }
    }

    func finalize(
        transferID: Data, attemptID: Data
    ) throws -> FolioleFramedSyncStageOutcome {
        try database.transaction {
            let state = try database.rows("""
                SELECT state FROM framed_sync_ios_outbound_attempts
                WHERE transfer_id = ? AND attempt_id = ?
                """, [transferID, attemptID]).first?[0] as? String
            guard let state else { throw invalid("outbound_attempt_missing") }
            if state == "replayable" { return .identical }
            try requireCompleteFrames(transferID: transferID, attemptID: attemptID)
            try database.execute("""
                UPDATE framed_sync_ios_outbound_attempts SET state = 'replayable'
                WHERE transfer_id = ? AND attempt_id = ?
                """, [transferID, attemptID])
            return .created
        }
    }

    func replayableFrames(
        transferID: Data, attemptID: Data
    ) throws -> [FolioleFramedSyncAuthenticatedFrame] {
        let rows = try database.rows("""
            SELECT a.preamble, f.frame_header, f.ciphertext, f.authenticated_plaintext
            FROM framed_sync_ios_outbound_attempts a
            JOIN framed_sync_ios_outbound_frames f
              ON f.transfer_id = a.transfer_id AND f.attempt_id = a.attempt_id
            WHERE a.transfer_id = ? AND a.attempt_id = ? AND a.state = 'replayable'
            ORDER BY length(f.sequence), f.sequence
            """, [transferID, attemptID])
        return try rows.map { row in
            guard let preamble = row[0] as? Data, let header = row[1] as? Data,
                  let ciphertext = row[2] as? Data, let plaintext = row[3] as? Data else {
                throw invalid("outbound_frame_storage_invalid")
            }
            return .init(transferID: transferID, attemptID: attemptID, preamble: preamble,
                         header: header, ciphertext: ciphertext, plaintext: plaintext)
        }
    }

    private func requireCompleteFrames(transferID: Data, attemptID: Data) throws {
        let rows = try database.rows("""
            SELECT sequence, frame_header FROM framed_sync_ios_outbound_frames
            WHERE transfer_id = ? AND attempt_id = ? ORDER BY length(sequence), sequence
            """, [transferID, attemptID])
        var expected: UInt64 = 0
        var finalType: FolioleFramedSyncFrameType?
        for row in rows {
            guard let sequenceText = row[0] as? String, let sequence = UInt64(sequenceText),
                  let encodedHeader = row[1] as? Data, sequence == expected else {
                throw invalid("outbound_frame_sequence_not_contiguous")
            }
            finalType = try FolioleFramedSyncWireHeader(decoding: encodedHeader).frameType
            expected += 1
        }
        guard expected > 0, finalType == .transferTrailer else {
            throw invalid("outbound_transfer_trailer_required")
        }
    }

    private func requireBinding(transferID: Data, attemptID: Data, encodedPreamble: Data) throws {
        guard transferID.count == 32, attemptID.count == 16 else {
            throw invalid("framed_sync_stage_identity_invalid")
        }
        let preamble = try FolioleFramedSyncPreamble(decoding: encodedPreamble)
        guard preamble.contextID == transferID, preamble.identifier == attemptID else {
            throw invalid("outbound_attempt_binding_mismatch")
        }
    }

    private func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}
