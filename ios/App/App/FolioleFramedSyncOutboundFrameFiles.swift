import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncOutboundFrameFiles {
    static let table = "framed_sync_ios_outbound_file_frames"
    private let database: FolioleFramedSyncTransferDatabase
    private let directory: URL

    init(database: FolioleFramedSyncTransferDatabase) throws {
        self.database = database
        directory = database.url.deletingLastPathComponent()
            .appendingPathComponent("outbound-frames", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try database.execute("""
            CREATE TABLE IF NOT EXISTS \(Self.table) (
            transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sequence TEXT NOT NULL,
            frame_header BLOB NOT NULL, wire_offset INTEGER NOT NULL,
            ciphertext_length INTEGER NOT NULL, ciphertext_sha256 BLOB NOT NULL,
            plaintext_sha256 BLOB NOT NULL, PRIMARY KEY (transfer_id, attempt_id, sequence),
            FOREIGN KEY (transfer_id, attempt_id) REFERENCES framed_sync_ios_outbound_attempts
            (transfer_id, attempt_id) ON DELETE CASCADE)
            """)
    }

    func commit(
        _ frame: FolioleFramedSyncAuthenticatedFrame, header: FolioleFramedSyncWireHeader
    ) throws -> FolioleFramedSyncStageOutcome {
        let ciphertextHash = digest(frame.ciphertext), plaintextHash = digest(frame.plaintext)
        let rows = try database.rows("""
            SELECT frame_header, wire_offset, ciphertext_length,
                   ciphertext_sha256, plaintext_sha256 FROM \(Self.table)
            WHERE transfer_id = ? AND attempt_id = ? AND sequence = ?
            """, [frame.transferID, frame.attemptID, String(header.sequence)])
        if let row = rows.first {
            guard let storedHeader = row[0] as? Data, let offset = row[1] as? Int,
                  let length = row[2] as? Int, let storedCiphertextHash = row[3] as? Data,
                  let storedPlaintextHash = row[4] as? Data,
                  storedHeader == frame.header, length == frame.ciphertext.count,
                  storedCiphertextHash == ciphertextHash, storedPlaintextHash == plaintextHash,
                  try read(frameFile(frame), offset: offset, length: length) == frame.ciphertext else {
                throw invalid("outbound_frame_identity_conflict")
            }
            return .identical
        }
        let offset = try nextOffset(transferID: frame.transferID, attemptID: frame.attemptID)
        try write(frameFile(frame), offset: offset, value: frame.ciphertext)
        try database.execute("""
            INSERT INTO \(Self.table) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, [frame.transferID, frame.attemptID, String(header.sequence), frame.header,
                  offset, frame.ciphertext.count, ciphertextHash, plaintextHash])
        return .created
    }

    func replay(
        transferID: Data, attemptID: Data, writer: FolioleFramedSyncStreamWriter
    ) throws {
        let rows = try database.rows("""
            SELECT f.frame_header, f.wire_offset, f.ciphertext_length, f.ciphertext_sha256
            FROM framed_sync_ios_outbound_attempts a JOIN \(Self.table) f
              ON f.transfer_id = a.transfer_id AND f.attempt_id = a.attempt_id
            WHERE a.transfer_id = ? AND a.attempt_id = ? AND a.state = 'replayable'
            ORDER BY length(f.sequence), f.sequence
            """, [transferID, attemptID])
        let file = frameFile(transferID: transferID, attemptID: attemptID)
        for row in rows {
            guard let header = row[0] as? Data, let offset = row[1] as? Int,
                  let length = row[2] as? Int, let expected = row[3] as? Data else {
                throw invalid("outbound_frame_storage_invalid")
            }
            let ciphertext = try read(file, offset: offset, length: length)
            guard digest(ciphertext) == expected else { throw invalid("outbound_frame_file_invalid") }
            try writer.write(header: header, ciphertext: ciphertext)
        }
    }

    func remove(transferID: Data, attemptID: Data) throws {
        let file = frameFile(transferID: transferID, attemptID: attemptID)
        if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
    }

    func requireComplete(transferID: Data, attemptID: Data) throws {
        let rows = try database.rows("""
            SELECT sequence, frame_header FROM \(Self.table)
            WHERE transfer_id = ? AND attempt_id = ? ORDER BY length(sequence), sequence
            """, [transferID, attemptID])
        var expected: UInt64 = 0
        var finalType: FolioleFramedSyncFrameType?
        for row in rows {
            guard let sequenceText = row[0] as? String, let sequence = UInt64(sequenceText),
                  let header = row[1] as? Data, sequence == expected else {
                throw invalid("outbound_frame_sequence_not_contiguous")
            }
            finalType = try FolioleFramedSyncWireHeader(decoding: header).frameType
            expected += 1
        }
        guard expected > 0, finalType == .transferTrailer else {
            throw invalid("outbound_transfer_trailer_required")
        }
    }

    private func nextOffset(transferID: Data, attemptID: Data) throws -> Int {
        try database.rows("""
            SELECT COALESCE(MAX(wire_offset + ciphertext_length), 0) FROM \(Self.table)
            WHERE transfer_id = ? AND attempt_id = ?
            """, [transferID, attemptID]).first?[0] as? Int ?? 0
    }

    private func frameFile(_ frame: FolioleFramedSyncAuthenticatedFrame) -> URL {
        frameFile(transferID: frame.transferID, attemptID: frame.attemptID)
    }

    private func frameFile(transferID: Data, attemptID: Data) -> URL {
        directory.appendingPathComponent("\(transferID.hex)-\(attemptID.hex).wire")
    }

    private func write(_ url: URL, offset: Int, value: Data) throws {
        if !FileManager.default.fileExists(atPath: url.path) { FileManager.default.createFile(atPath: url.path, contents: nil) }
        let handle = try FileHandle(forWritingTo: url); defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(offset)); try handle.write(contentsOf: value)
        try handle.truncate(atOffset: UInt64(offset + value.count))
    }

    private func read(_ url: URL, offset: Int, length: Int) throws -> Data {
        guard offset >= 0, length >= 0 else { throw invalid("outbound_frame_file_invalid") }
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(offset))
        let value = try handle.read(upToCount: length) ?? Data()
        guard value.count == length else { throw invalid("outbound_frame_file_invalid") }
        return value
    }

    private func digest(_ data: Data) -> Data { Data(SHA256.hash(data: data)) }
    private func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}
