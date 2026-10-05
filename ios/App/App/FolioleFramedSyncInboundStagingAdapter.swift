import Foundation
import FolioleFramedSyncRuntime

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
        validated: FolioleFramedSyncValidatedMessage,
        context: FolioleFramedSyncTransferContext
    ) throws -> FolioleFramedSyncStageOutcome
}

final class FolioleFramedSyncInboundStagingAdapter {
    private let staging: FolioleFramedSyncDurableStaging

    init(staging: FolioleFramedSyncDurableStaging) { self.staging = staging }

    convenience init(databaseURL: URL) throws {
        try self.init(staging: FolioleFramedSyncSQLiteStaging(databaseURL: databaseURL))
    }

    func commitAuthenticatedFrame(
        _ frame: FolioleFramedSyncAuthenticatedFrame,
        context: FolioleFramedSyncTransferContext
    ) throws -> FolioleFramedSyncStageOutcome {
        _ = try FolioleFramedSyncPreamble(decoding: frame.preamble)
        let header = try FolioleFramedSyncWireHeader(decoding: frame.header)
        guard header.ciphertextBytes == frame.ciphertext.count else {
            throw FolioleFramedSyncValidationError("framed_sync_frame_body_length_mismatch")
        }
        let validated = try FolioleFramedSyncCodec.decode(
            frame.plaintext, authenticatedFrameType: header.frameType.rawValue
        )
        try requireTransferBinding(validated.payload, frame: frame)
        return try staging.commit(frame, validated: validated, context: context)
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
        default: throw FolioleFramedSyncValidationError("transfer_frame_payload_required")
        }
        guard transferID == frame.transferID else {
            throw FolioleFramedSyncValidationError("transfer_identity_mismatch")
        }
    }
}
