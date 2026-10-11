import CryptoKit
import Foundation
import FolioleFramedSyncRuntime

struct FolioleFramedSyncFileFrames {
    let files: FolioleFramedSyncFiles

    func commit(_ frame: FolioleFramedSyncAuthenticatedFrame, compact: Bool) throws {
        let header = try FolioleFramedSyncWireHeader(decoding: frame.header)
        var bytes = Data([compact ? 1 : 0])
        bytes.append(frame.preamble)
        bytes.append(frame.header)
        bytes.append(Data(SHA256.hash(data: frame.ciphertext)))
        bytes.append(compact ? Data(SHA256.hash(data: frame.plaintext)) : frame.plaintext)
        let key = try path(frame.transferID, frame.attemptID, header.sequence)
        if let prior = try files.read(key) {
            guard prior == bytes else { throw invalid("inbound_frame_identity_conflict") }
        } else { try files.write(key, data: bytes) }
    }

    func plaintext(_ transfer: Data, _ attempt: Data, _ sequence: UInt64) throws -> Data {
        guard let bytes = try files.read(path(transfer, attempt, sequence)), bytes.count >= 145,
              bytes[0] == 0 else { throw invalid("inbound_frame_file_missing") }
        let preamble = try FolioleFramedSyncPreamble(decoding: Data(bytes[1..<97]))
        let header = try FolioleFramedSyncWireHeader(decoding: Data(bytes[97..<113]))
        guard preamble.contextID == transfer, preamble.identifier == attempt,
              header.sequence == sequence else { throw invalid("inbound_frame_identity_conflict") }
        return Data(bytes.dropFirst(145))
    }

    func fact(_ transfer: Data, _ attempt: Data, _ sequence: UInt64) throws -> Foliole_Sync_V22_FactRecord {
        try FolioleFramedSyncDurableFactReader.read(firstSequence: sequence) {
            try plaintext(transfer, attempt, $0)
        }
    }

    private func path(_ transfer: Data, _ attempt: Data, _ sequence: UInt64) throws -> String {
        try FolioleFramedSyncFileRecords.attempt(transfer, attempt) + "/frames/\(sequence).frame"
    }

    private func invalid(_ code: String) -> Error { FolioleFramedSyncValidationError(code) }
}
