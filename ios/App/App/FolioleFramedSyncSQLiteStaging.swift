import CryptoKit
import Foundation
import FolioleFramedSyncRuntime
import SQLite3

// sql-surface: ios-isolated-framed-staging-owner
final class FolioleFramedSyncSQLiteStaging: FolioleFramedSyncDurableStaging {
    private var database: OpaquePointer?
    private let resources: FolioleFramedSyncInboundResources

    init(databaseURL: URL, resourceRoot: URL? = nil) throws {
        let transferDatabase = try FolioleFramedSyncTransferDatabase(url: databaseURL)
        resources = try .init(
            database: transferDatabase,
            root: resourceRoot ?? databaseURL.deletingLastPathComponent()
                .appendingPathComponent("attachments", isDirectory: true)
        )
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
        validated: FolioleFramedSyncValidatedMessage,
        context: FolioleFramedSyncTransferContext
    ) throws -> FolioleFramedSyncStageOutcome {
        guard frame.transferID.count == 32, frame.attemptID.count == 16 else {
            throw FolioleFramedSyncValidationError("framed_sync_stage_identity_invalid")
        }
        let wire = try FolioleFramedSyncCodec.encode(validated)
        guard wire == frame.plaintext else {
            throw FolioleFramedSyncValidationError("framed_sync_stage_plaintext_mismatch")
        }
        let header = try FolioleFramedSyncWireHeader(decoding: frame.header)
        let resourceChunk: Foliole_Sync_V22_BlobChunk?
        if case .blobChunk(let chunk) = validated.payload,
           try resources.isResource(
            transferID: frame.transferID, attemptID: frame.attemptID, hash: chunk.blobHash
           ) { resourceChunk = chunk } else { resourceChunk = nil }
        try execute("BEGIN IMMEDIATE")
        do {
            if case .transferHeader(let value) = validated.payload {
                try admitHeader(frame, header: value, context: context)
            } else {
                try requireReceivingAttempt(frame)
            }
            let outcome = try insertOrCompare(frame, header: header, digestOnly: resourceChunk != nil)
            try execute("COMMIT")
            if case .transferHeader(let value) = validated.payload {
                try resources.admit(
                    transferID: frame.transferID, attemptID: frame.attemptID,
                    blobs: value.manifest.blobs
                )
            } else if let resourceChunk {
                try resources.stage(
                    transferID: frame.transferID, attemptID: frame.attemptID, chunk: resourceChunk
                )
            }
            return outcome
        } catch {
            try? execute("ROLLBACK")
            throw error
        }
    }

    func finishResources(
        transferID: Data, attemptID: Data
    ) throws -> Set<Data> {
        try resources.finish(transferID: transferID, attemptID: attemptID)
    }

    private func admitHeader(
        _ frame: FolioleFramedSyncAuthenticatedFrame,
        header: Foliole_Sync_V22_TransferHeader,
        context: FolioleFramedSyncTransferContext
    ) throws {
        let manifest = header.manifest
        let totalBytes = manifest.blobs.reduce(UInt64(0)) { $0 + $1.byteLength }
        let values: [Any] = [manifest.contentID, manifest.facts.count, manifest.blobs.count,
                             totalBytes, context.senderDeviceID, context.senderLibraryEpoch,
                             context.receiverDeviceID, context.receiverLibraryEpoch,
                             frame.attemptID]
        if try row("SELECT active_attempt_id FROM framed_sync_ios_transfers WHERE transfer_id = ?",
                   values: [frame.transferID]) == nil {
            try execute("""
                INSERT INTO framed_sync_ios_transfers VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'receiving')
                """, values: [frame.transferID] + values)
            return
        }
        let matched = try row("""
            SELECT 1 FROM framed_sync_ios_transfers WHERE transfer_id = ? AND content_id = ?
              AND fact_count = ? AND blob_count = ? AND total_blob_bytes = ?
              AND sender_device_id = ? AND sender_library_epoch = ?
              AND receiver_device_id = ? AND receiver_library_epoch = ?
              AND active_attempt_id = ? AND state = 'receiving'
            """, values: [frame.transferID] + values)
        guard matched != nil else {
            throw FolioleFramedSyncValidationError("inbound_header_conflict")
        }
    }

    private func requireReceivingAttempt(_ frame: FolioleFramedSyncAuthenticatedFrame) throws {
        let sql = """
        SELECT 1 FROM framed_sync_ios_transfers t
        JOIN framed_sync_ios_frames first ON first.transfer_id = t.transfer_id
          AND first.attempt_id = t.active_attempt_id AND first.sequence = '0'
        WHERE t.transfer_id = ? AND t.active_attempt_id = ? AND t.state = 'receiving'
          AND first.preamble = ?
        """
        guard try row(sql, values: [frame.transferID, frame.attemptID, frame.preamble]) != nil else {
            throw FolioleFramedSyncValidationError("inbound_attempt_unavailable")
        }
    }

    private func insertOrCompare(
        _ frame: FolioleFramedSyncAuthenticatedFrame,
        header: FolioleFramedSyncWireHeader,
        digestOnly: Bool
    ) throws -> FolioleFramedSyncStageOutcome {
        let key: [Any] = [frame.transferID, frame.attemptID, String(header.sequence)]
        let existing = try row("""
            SELECT frame_type, preamble, frame_header, ciphertext, authenticated_plaintext
            FROM framed_sync_ios_frames
            WHERE transfer_id = ? AND attempt_id = ? AND sequence = ?
            """, values: key)
        if let existing {
            let ciphertext = digestOnly ? Data(SHA256.hash(data: frame.ciphertext)) : frame.ciphertext
            let plaintext = digestOnly ? Data(SHA256.hash(data: frame.plaintext)) : frame.plaintext
            let expected: [Any] = [Int(header.frameType.rawValue), frame.preamble, frame.header,
                                   ciphertext, plaintext]
            guard valuesEqual(existing, expected) else {
                throw FolioleFramedSyncValidationError("inbound_frame_identity_conflict")
            }
            return .identical
        }
        let ciphertext = digestOnly ? Data(SHA256.hash(data: frame.ciphertext)) : frame.ciphertext
        let plaintext = digestOnly ? Data(SHA256.hash(data: frame.plaintext)) : frame.plaintext
        try execute("""
            INSERT INTO framed_sync_ios_frames
              (transfer_id, attempt_id, sequence, frame_type, preamble, frame_header,
               ciphertext, authenticated_plaintext)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, values: key + [Int(header.frameType.rawValue), frame.preamble, frame.header,
                                  ciphertext, plaintext])
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
        } else if let integer = value as? UInt64 {
            sqlite3_bind_int64(statement, index, sqlite3_int64(bitPattern: integer))
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
        if sqlite3_column_type(statement, index) == SQLITE_TEXT {
            return sqlite3_column_text(statement, index).map { String(cString: $0) } ?? ""
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
