import Foundation
import FolioleFramedSyncRuntime

protocol FolioleFramedSyncOutboundStaging {
    func prepare(transferID: Data, attemptID: Data, preamble: Data) throws -> FolioleFramedSyncStageOutcome
    func commit(_ frame: FolioleFramedSyncAuthenticatedFrame) throws -> FolioleFramedSyncStageOutcome
    func finalize(transferID: Data, attemptID: Data) throws -> FolioleFramedSyncStageOutcome
    func replayFrames(
        transferID: Data, attemptID: Data, writer: FolioleFramedSyncStreamWriter
    ) throws
}

final class FolioleFramedSyncOutboundSQLite: FolioleFramedSyncOutboundStaging {
    private let database: FolioleFramedSyncTransferDatabase
    private let frames: FolioleFramedSyncOutboundFrameFiles

    init(database: FolioleFramedSyncTransferDatabase) throws {
        self.database = database
        frames = try .init(database: database)
    }

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
            return try frames.commit(frame, header: header)
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

    func replayFrames(
        transferID: Data, attemptID: Data, writer: FolioleFramedSyncStreamWriter
    ) throws {
        try frames.replay(transferID: transferID, attemptID: attemptID, writer: writer)
    }

    private func requireCompleteFrames(transferID: Data, attemptID: Data) throws {
        try frames.requireComplete(transferID: transferID, attemptID: attemptID)
    }

    func loadLatestReplayableAttempt(transferID: Data) throws -> FolioleFramedSyncOutboundAttempt? {
        guard transferID.count == 32 else { throw invalid("transfer_id_invalid") }
        let row = try database.rows("""
            SELECT attempt_id, preamble FROM framed_sync_ios_outbound_attempts a
            WHERE transfer_id = ? AND state = 'replayable' AND EXISTS (
              SELECT 1 FROM \(FolioleFramedSyncOutboundFrameFiles.table) f
              WHERE f.transfer_id = a.transfer_id AND f.attempt_id = a.attempt_id)
            ORDER BY rowid DESC LIMIT 1
            """, [transferID]).first
        guard let attemptID = row?[0] as? Data, let preamble = row?[1] as? Data else { return nil }
        return .init(transferID: transferID, attemptID: attemptID, preamble: preamble)
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
