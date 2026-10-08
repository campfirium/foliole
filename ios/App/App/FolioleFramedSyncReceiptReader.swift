import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncReceiptReader {
    static func read(
        _ data: Data, groupKey: Data, transferID: Data, contentID: Data,
        receiverDeviceID: String, receiverLibraryEpoch: String,
        owner: FolioleFramedSyncPayloadBudget? = nil
    ) throws -> Foliole_Sync_V22_TransferReceipt {
        try read(InputStream(data: data), groupKey: groupKey, transferID: transferID, contentID: contentID,
            receiverDeviceID: receiverDeviceID, receiverLibraryEpoch: receiverLibraryEpoch, owner: owner)
    }

    static func read(
        _ input: InputStream, groupKey: Data, transferID: Data, contentID: Data,
        receiverDeviceID: String, receiverLibraryEpoch: String,
        owner: FolioleFramedSyncPayloadBudget? = nil
    ) throws -> Foliole_Sync_V22_TransferReceipt {
        try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .inbound, lane: .receipt) { _ in
        let reader = FolioleFramedSyncStreamReader(input: input)
        let preamble = try reader.nextPreamble()
        guard preamble.contextKind == 2, preamble.contextID == transferID else {
            throw invalid("framed_sync_receipt_context_mismatch")
        }
        guard let frame = try reader.nextFrame(maximumCiphertextBytes: 1_048_576), frame.header.frameType == .transferReceipt,
              frame.header.sequence == 0 else {
            throw invalid("framed_sync_receipt_frame_required")
        }
        let plaintext = try FolioleFramedSyncFrameCrypto.decrypt(
            groupKey: groupKey, preamble: preamble, frame: frame, expectedSequence: 0
        )
        let message = try FolioleFramedSyncCodec.decode(
            plaintext, authenticatedFrameType: FolioleFramedSyncFrameType.transferReceipt.rawValue
        )
        guard case .transferReceipt(let receipt) = message.payload,
              try reader.nextFrame(maximumCiphertextBytes: 1_048_576) == nil,
              receipt.transferID == transferID, receipt.contentID == contentID,
              receipt.receiverDeviceID == receiverDeviceID,
              receipt.receiverLibraryEpoch == receiverLibraryEpoch else {
            throw invalid("framed_sync_receipt_identity_mismatch")
        }
        return receipt
        }
    }

    private static func invalid(_ code: String) -> FolioleFramedSyncValidationError { .init(code) }
}
