import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncReceiptWriter {
    static func encode(
        groupKey: Data, value: [String: Any], database: FolioleFramedSyncTransferDatabase
    ) throws -> Data {
        var receipt = Foliole_Sync_V22_TransferReceipt()
        receipt.transferID = try digest(value, "transfer_id")
        receipt.contentID = try digest(value, "content_id")
        receipt.appliedStateHash = try digest(value, "applied_state_hash")
        receipt.receiverDeviceID = try text(value, "receiver_device_id")
        receipt.receiverLibraryEpoch = try text(value, "receiver_library_epoch")
        var message = Foliole_Sync_V22_ProtocolMessage()
        message.payload = .transferReceipt(receipt)
        let validated = try FolioleFramedSyncCodec.validateOutbound(
            message, authenticatedFrameType: FolioleFramedSyncFrameType.transferReceipt.rawValue
        )
        let plaintext = try FolioleFramedSyncCodec.encode(validated)
        guard plaintext.count + 16 <= 1_048_576 else { throw invalid("framed_sync_receipt_limit_exceeded") }
        let preamble = try makePreamble(transferID: receipt.transferID)
        let header = try FolioleFramedSyncWireHeader(
            ciphertextBytes: plaintext.count + 16, sequence: 0, frameType: .transferReceipt
        ).encode()
        try prepare(receipt, preamble: preamble, database: database)
        let ciphertext = try FolioleFramedSyncFrameCrypto.encrypt(
            groupKey: groupKey, preamble: preamble, header: header, plaintext: plaintext, sequence: 0
        )
        try database.transaction {
            try database.execute("""
                INSERT INTO framed_sync_ios_receipt_frames VALUES (?, ?, '0', ?, ?, ?)
                """, [receipt.transferID, preamble.identifier, header, ciphertext, plaintext])
            try database.execute("""
                UPDATE framed_sync_ios_receipt_attempts SET state = 'replayable'
                WHERE transfer_id = ? AND attempt_id = ?
                """, [receipt.transferID, preamble.identifier])
        }
        let output = OutputStream.toMemory()
        let writer = FolioleFramedSyncStreamWriter(output: output)
        try writer.write(preamble: preamble.encoded); try writer.write(header: header, ciphertext: ciphertext)
        guard let data = output.property(forKey: .dataWrittenToMemoryStreamKey) as? Data else {
            throw FolioleFramedSyncValidationError("framed_sync_stream_write_failed")
        }
        try FolioleFramedSyncCompletedInboundCleanup.retire(database: database, transferID: receipt.transferID)
        return data
    }

    private static func prepare(
        _ receipt: Foliole_Sync_V22_TransferReceipt, preamble: FolioleFramedSyncPreamble,
        database: FolioleFramedSyncTransferDatabase
    ) throws {
        try database.transaction {
            let rows = try database.rows("""
                SELECT content_id, receiver_device_id, receiver_library_epoch, applied_state_hash
                FROM framed_sync_ios_receipts WHERE transfer_id = ?
                """, [receipt.transferID])
            if let row = rows.first {
                guard row[0] as? Data == receipt.contentID,
                      row[1] as? String == receipt.receiverDeviceID,
                      row[2] as? String == receipt.receiverLibraryEpoch,
                      row[3] as? Data == receipt.appliedStateHash else {
                    throw invalid("receipt_identity_conflict")
                }
            } else {
                try database.execute("""
                    INSERT INTO framed_sync_ios_receipts VALUES (?, ?, ?, ?, ?)
                    """, [receipt.transferID, receipt.contentID, receipt.receiverDeviceID,
                            receipt.receiverLibraryEpoch, receipt.appliedStateHash])
            }
            try database.execute("""
                INSERT INTO framed_sync_ios_receipt_attempts VALUES (?, ?, ?, 'prepared')
                """, [receipt.transferID, preamble.identifier, preamble.encoded])
        }
    }

    private static func makePreamble(transferID: Data) throws -> FolioleFramedSyncPreamble {
        guard transferID.count == 32 else { throw invalid("transfer_id_invalid") }
        let attemptID = withUnsafeBytes(of: UUID().uuid) { Data($0) }
        var nonce = UInt32.random(in: .min ... .max).bigEndian
        let noncePrefix = withUnsafeBytes(of: &nonce) { Data($0) }
        var bytes = Data(repeating: 0, count: FolioleFramedSyncPreamble.byteCount)
        bytes.replaceSubrange(0..<8, with: Data("FOLSYNC2".utf8))
        bytes[8] = 0; bytes[9] = UInt8(FolioleFramedSyncPreamble.byteCount)
        bytes[10] = 0; bytes[11] = 22; bytes[12] = 2
        bytes.replaceSubrange(16..<48, with: transferID)
        bytes.replaceSubrange(48..<64, with: attemptID)
        bytes.replaceSubrange(64..<68, with: noncePrefix)
        return try FolioleFramedSyncPreamble(decoding: bytes)
    }

    private static func digest(_ value: [String: Any], _ name: String) throws -> Data {
        guard let text = value[name] as? String, text.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
        else { throw invalid("framed_sync_receipt_digest_invalid") }
        var result = Data(capacity: 32)
        for index in stride(from: 0, to: text.count, by: 2) {
            let start = text.index(text.startIndex, offsetBy: index)
            let end = text.index(start, offsetBy: 2)
            guard let byte = UInt8(text[start..<end], radix: 16) else { throw invalid("framed_sync_receipt_digest_invalid") }
            result.append(byte)
        }
        return result
    }

    private static func text(_ value: [String: Any], _ name: String) throws -> String {
        guard let text = value[name] as? String, !text.isEmpty else {
            throw invalid("framed_sync_receipt_identity_invalid")
        }
        return text
    }

    private static func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}
