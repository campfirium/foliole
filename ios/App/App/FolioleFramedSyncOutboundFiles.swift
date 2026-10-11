import Foundation
import FolioleFramedSyncRuntime

final class FolioleFramedSyncOutboundFiles: FolioleFramedSyncOutboundPublicationStaging {
    private let files: FolioleFramedSyncFiles
    private let owner: FolioleFramedSyncPayloadBudget?
    private let purpose: String

    init(owner: FolioleFramedSyncPayloadBudget) throws {
        try owner.requireActive()
        files = try .init(libraryKey: owner.libraryKey)
        self.owner = owner
        purpose = "transfer"
    }

    init(files: FolioleFramedSyncFiles, purpose: String) {
        self.files = files; self.purpose = purpose; owner = nil
    }

    func discard(transferID: Data) throws {
        try files.remove(base(transferID))
    }

    func prepare(transferID: Data, attemptID: Data, preamble: Data) throws -> FolioleFramedSyncStageOutcome {
        let decoded = try FolioleFramedSyncPreamble(decoding: preamble)
        guard decoded.contextKind == 2, decoded.contextID == transferID,
              decoded.identifier == attemptID, decoded.startingSequence == 0 else { throw invalid("outbound_attempt_binding_mismatch") }
        let key = try directory(transferID, attemptID) + "/attempt.json"
        if let prior = try FolioleFramedSyncFileRecords.read(files, key) {
            guard try FolioleFramedSyncFileRecords.bytes(prior["preamble"]) == preamble else {
                throw invalid("outbound_attempt_identity_conflict")
            }
            return .identical
        }
        try FolioleFramedSyncFileRecords.write(files, key, ["attemptId": Array(attemptID),
            "noncePrefix": Array(preamble[64..<68]), "preamble": Array(preamble), "state": "prepared", "frameCount": 0])
        return .created
    }

    func commit(_ frame: FolioleFramedSyncAuthenticatedFrame) throws -> FolioleFramedSyncStageOutcome {
        let directory = try directory(frame.transferID, frame.attemptID)
        guard var record = try FolioleFramedSyncFileRecords.read(files, directory + "/attempt.json"),
              record["state"] as? String == "prepared",
              try FolioleFramedSyncFileRecords.bytes(record["preamble"]) == frame.preamble,
              let count = record["frameCount"] as? Int else { throw invalid("outbound_attempt_not_prepared") }
        let header = try FolioleFramedSyncWireHeader(decoding: frame.header)
        guard header.ciphertextBytes == frame.ciphertext.count else { throw invalid("outbound_frame_length_mismatch") }
        let key = directory + "/frames/\(header.sequence).frame"
        let value = frame.header + frame.ciphertext
        if let prior = try files.read(key) {
            guard prior == value else { throw invalid("outbound_frame_identity_conflict") }
            return .identical
        }
        guard header.sequence == UInt64(count) else { throw invalid("outbound_frame_sequence_mismatch") }
        try files.write(key, data: value)
        record["frameCount"] = count + 1
        try FolioleFramedSyncFileRecords.write(files, directory + "/attempt.json", record)
        return .created
    }

    func finalize(transferID: Data, attemptID: Data) throws -> FolioleFramedSyncStageOutcome {
        let directory = try directory(transferID, attemptID)
        guard var record = try FolioleFramedSyncFileRecords.read(files, directory + "/attempt.json"),
              let count = record["frameCount"] as? Int, count > 0 else { throw invalid("outbound_attempt_missing") }
        if record["state"] as? String == "replayable" { return .identical }
        guard record["state"] as? String == "prepared" else { throw invalid("outbound_attempt_not_prepared") }
        for sequence in 0..<count {
            let frame = try readFrame(directory, sequence)
            let expected: FolioleFramedSyncFrameType? = purpose == "receipt" ? .transferReceipt :
                (sequence == 0 ? .transferHeader : (sequence == count - 1 ? .transferTrailer : nil))
            if let expected, frame.0.frameType != expected { throw invalid("outbound_frames_incomplete") }
        }
        guard purpose != "receipt" || count == 1 else { throw invalid("outbound_frames_incomplete") }
        record["state"] = "replayable"
        try FolioleFramedSyncFileRecords.write(files, directory + "/attempt.json", record)
        return .created
    }

    func replayFrames(transferID: Data, attemptID: Data, writer: FolioleFramedSyncStreamWriter) throws {
        let directory = try directory(transferID, attemptID)
        guard let record = try FolioleFramedSyncFileRecords.read(files, directory + "/attempt.json"),
              record["state"] as? String == "replayable", let count = record["frameCount"] as? Int else {
            throw invalid("outbound_attempt_not_replayable")
        }
        for sequence in 0..<count {
            try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .outbound) { _ in
                let frame = try readFrame(directory, sequence)
                try writer.write(header: Data(frame.1.prefix(16)), ciphertext: Data(frame.1.dropFirst(16)))
            }
        }
    }

    func loadLatestReplayableAttempt(transferID: Data) throws -> FolioleFramedSyncOutboundAttempt? {
        for entry in try files.list(base(transferID)) {
            guard let record = try FolioleFramedSyncFileRecords.read(files, base(transferID) + "/\(entry)/attempt.json"),
                  record["state"] as? String == "replayable" else { continue }
            let preamble = try FolioleFramedSyncFileRecords.bytes(record["preamble"])
            let decoded = try FolioleFramedSyncPreamble(decoding: preamble)
            guard decoded.contextID == transferID, decoded.identifier.hex == entry else { throw invalid("outbound_attempt_binding_mismatch") }
            return .init(transferID: transferID, attemptID: decoded.identifier, preamble: preamble)
        }
        return nil
    }

    private func readFrame(_ directory: String, _ sequence: Int) throws -> (FolioleFramedSyncWireHeader, Data) {
        guard let bytes = try files.read(directory + "/frames/\(sequence).frame"), bytes.count >= 16 else {
            throw invalid("outbound_frame_missing")
        }
        let header = try FolioleFramedSyncWireHeader(decoding: Data(bytes.prefix(16)))
        guard header.sequence == UInt64(sequence), header.ciphertextBytes == bytes.count - 16 else {
            throw invalid("outbound_frame_identity_conflict")
        }
        return (header, bytes)
    }

    private func base(_ transfer: Data) throws -> String {
        guard transfer.count == 32 else { throw invalid("transfer_id_invalid") }
        return "attempts/\(transfer.hex)/\(purpose)"
    }
    private func directory(_ transfer: Data, _ attempt: Data) throws -> String {
        guard attempt.count == 16 else { throw invalid("attempt_id_invalid") }
        return try base(transfer) + "/\(attempt.hex)"
    }
    private func invalid(_ code: String) -> Error { FolioleFramedSyncValidationError(code) }
}
