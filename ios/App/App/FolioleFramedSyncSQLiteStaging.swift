import Foundation
import FolioleFramedSyncRuntime
import SQLite3

enum FolioleFramedSyncStageOutcome: Equatable {
    case created
    case identical
}

struct FolioleFramedSyncAuthenticatedFrame {
    let transferID: Data
    let attemptID: Data
    let preamble: Data
    let header: Data
    let ciphertext: Data
    let plaintext: Data
}

protocol FolioleFramedSyncDurableStaging {
    func commit(
        _ frame: FolioleFramedSyncAuthenticatedFrame,
        validated: FolioleFramedSyncValidatedMessage
    ) throws -> FolioleFramedSyncStageOutcome
}

final class FolioleFramedSyncInboundStagingAdapter {
    private let staging: FolioleFramedSyncDurableStaging

    init(staging: FolioleFramedSyncDurableStaging) {
        self.staging = staging
    }

    convenience init(databaseURL: URL) throws {
        try self.init(staging: FolioleFramedSyncSQLiteStaging(databaseURL: databaseURL))
    }

    func commitAuthenticatedFrame(
        _ frame: FolioleFramedSyncAuthenticatedFrame
    ) throws -> FolioleFramedSyncStageOutcome {
        _ = try FolioleFramedSyncPreamble(decoding: frame.preamble)
        let header = try FolioleFramedSyncWireHeader(decoding: frame.header)
        guard header.ciphertextBytes == frame.ciphertext.count else {
            throw FolioleFramedSyncValidationError("framed_sync_frame_body_length_mismatch")
        }
        let validated = try FolioleFramedSyncCodec.decode(
            frame.plaintext,
            authenticatedFrameType: header.frameType.rawValue
        )
        try requireTransferBinding(validated.payload, frame: frame)
        return try staging.commit(frame, validated: validated)
    }

    private func requireTransferBinding(
        _ payload: FolioleFramedSyncPayload,
        frame: FolioleFramedSyncAuthenticatedFrame
    ) throws {
        let transferID: Data
        switch payload {
        case .transferHeader(let value):
            guard value.attemptID == frame.attemptID else {
                throw FolioleFramedSyncValidationError("attempt_identity_mismatch")
            }
            transferID = value.transferID
        case .blobChunk(let value): transferID = value.transferID
        case .transferTrailer(let value): transferID = value.transferID
        case .transferReceipt(let value): transferID = value.transferID
        case .fact: return
        default:
            throw FolioleFramedSyncValidationError("transfer_frame_payload_required")
        }
        guard transferID == frame.transferID else {
            throw FolioleFramedSyncValidationError("transfer_identity_mismatch")
        }
    }
}

final class FolioleFramedSyncSQLiteStaging: FolioleFramedSyncDurableStaging {
    private var database: OpaquePointer?

    init(databaseURL: URL) throws {
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(databaseURL.path, &database, flags, nil) == SQLITE_OK,
              let database else {
            throw FolioleFramedSyncValidationError("framed_sync_database_open_failed")
        }
        sqlite3_busy_timeout(database, 5_000)
        try execute("PRAGMA foreign_keys = ON")
    }

    deinit { if let database { sqlite3_close(database) } }

    func commit(
        _ frame: FolioleFramedSyncAuthenticatedFrame,
        validated: FolioleFramedSyncValidatedMessage
    ) throws -> FolioleFramedSyncStageOutcome {
        guard frame.transferID.count == 32, frame.attemptID.count == 16 else {
            throw FolioleFramedSyncValidationError("framed_sync_stage_identity_invalid")
        }
        let wire = try FolioleFramedSyncCodec.encode(validated)
        guard wire == frame.plaintext else {
            throw FolioleFramedSyncValidationError("framed_sync_stage_plaintext_mismatch")
        }
        let header = try FolioleFramedSyncWireHeader(decoding: frame.header)
        try execute("BEGIN IMMEDIATE")
        do {
            try requireReceivingAttempt(frame)
            let outcome = try insertOrCompare(frame, header: header)
            try execute("COMMIT")
            return outcome
        } catch {
            try? execute("ROLLBACK")
            throw error
        }
    }

    private func requireReceivingAttempt(_ frame: FolioleFramedSyncAuthenticatedFrame) throws {
        let sql = """
        SELECT 1 FROM framed_sync_inbound_attempts a
        JOIN framed_sync_inbound_transfers t ON t.transfer_id = a.transfer_id
        WHERE a.transfer_id = ? AND a.attempt_id = ? AND a.state = 'receiving'
          AND t.active_attempt_id = a.attempt_id
        """
        guard try row(sql, values: [frame.transferID, frame.attemptID]) != nil else {
            throw FolioleFramedSyncValidationError("inbound_attempt_unavailable")
        }
    }

    private func insertOrCompare(
        _ frame: FolioleFramedSyncAuthenticatedFrame,
        header: FolioleFramedSyncWireHeader
    ) throws -> FolioleFramedSyncStageOutcome {
        let key: [Any] = [frame.transferID, frame.attemptID, String(header.sequence)]
        let existing = try row("""
            SELECT frame_type, preamble, frame_header, ciphertext, authenticated_plaintext
            FROM framed_sync_inbound_frames
            WHERE transfer_id = ? AND attempt_id = ? AND sequence = ?
            """, values: key)
        if let existing {
            let expected: [Any] = [Int(header.frameType.rawValue), frame.preamble, frame.header,
                                   frame.ciphertext, frame.plaintext]
            guard valuesEqual(existing, expected) else {
                throw FolioleFramedSyncValidationError("inbound_frame_identity_conflict")
            }
            return .identical
        }
        try execute("""
            INSERT INTO framed_sync_inbound_frames
              (transfer_id, attempt_id, sequence, frame_type, preamble, frame_header,
               ciphertext, authenticated_plaintext)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, values: key + [Int(header.frameType.rawValue), frame.preamble, frame.header,
                                  frame.ciphertext, frame.plaintext])
        return .created
    }

    private func row(_ sql: String, values: [Any]) throws -> [Any]? {
        let statement = try prepare(sql, values: values)
        defer { sqlite3_finalize(statement) }
        let status = sqlite3_step(statement)
        if status == SQLITE_DONE { return nil }
        guard status == SQLITE_ROW else { throw databaseError() }
        return (0..<sqlite3_column_count(statement)).map { column(statement, index: $0) }
    }

    private func execute(_ sql: String, values: [Any] = []) throws {
        let statement = try prepare(sql, values: values)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw databaseError() }
    }

    private func prepare(_ sql: String, values: [Any]) throws -> OpaquePointer {
        guard let database else { throw FolioleFramedSyncValidationError("framed_sync_database_closed") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
              let statement else { throw databaseError() }
        for (offset, value) in values.enumerated() { bind(value, to: statement, index: Int32(offset + 1)) }
        return statement
    }

    private func bind(_ value: Any, to statement: OpaquePointer, index: Int32) {
        if let text = value as? String {
            sqlite3_bind_text(statement, index, text, -1, Self.transient)
        } else if let integer = value as? Int {
            sqlite3_bind_int64(statement, index, sqlite3_int64(integer))
        } else if let data = value as? Data {
            _ = data.withUnsafeBytes { bytes in
                sqlite3_bind_blob(statement, index, bytes.baseAddress, Int32(data.count), Self.transient)
            }
        }
    }

    private func column(_ statement: OpaquePointer, index: Int32) -> Any {
        if sqlite3_column_type(statement, index) == SQLITE_INTEGER {
            return Int(sqlite3_column_int64(statement, index))
        }
        let count = Int(sqlite3_column_bytes(statement, index))
        return sqlite3_column_blob(statement, index).map { Data(bytes: $0, count: count) } ?? Data()
    }

    private func valuesEqual(_ left: [Any], _ right: [Any]) -> Bool {
        zip(left, right).allSatisfy { pair in
            if let left = pair.0 as? Int, let right = pair.1 as? Int { return left == right }
            if let left = pair.0 as? Data, let right = pair.1 as? Data { return left == right }
            return false
        }
    }

    private func databaseError() -> FolioleFramedSyncValidationError {
        let message = database.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown"
        return FolioleFramedSyncValidationError("framed_sync_database_error:\(message)")
    }

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
}
