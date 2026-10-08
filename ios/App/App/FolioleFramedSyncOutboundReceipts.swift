import Foundation
import FolioleFramedSyncRuntime

enum FolioleFramedSyncOutboundReceipts {
    static func readEach(_ source: URL, expected: [FolioleFramedSyncOutboundUnit], request: FolioleFramedSyncOutboundRequest,
        owner: FolioleFramedSyncPayloadBudget, consume: (FolioleFramedSyncOutboundUnit, [String: Any]) throws -> Void) throws {
        var remaining = [Data: FolioleFramedSyncOutboundUnit]()
        for unit in expected {
            guard remaining.updateValue(unit, forKey: unit.transferID) == nil else { throw invalid("framed_sync_batch_transfer_duplicate") }
        }
        try FolioleFramedSyncTransferSequence.readEach(source, owner: owner) { unit in
            guard unit.receipt, let original = remaining.removeValue(forKey: unit.preamble.contextID),
                  let input = InputStream(url: unit.url) else { throw invalid("framed_sync_batch_receipt_unexpected") }
            try FolioleFramedSyncPayloadWorker.withLoan(owner, direction: .inbound, lane: .receipt) { _ in
                let receipt = try FolioleFramedSyncReceiptReader.read(input, groupKey: request.groupKey,
                    transferID: original.transferID, contentID: original.contentID,
                    receiverDeviceID: request.context.receiverDeviceID, receiverLibraryEpoch: request.context.receiverLibraryEpoch)
                try consume(original, ["transfer_id": receipt.transferID.hex, "content_id": receipt.contentID.hex,
                    "applied_state_hash": receipt.appliedStateHash.hex, "receiver_device_id": receipt.receiverDeviceID,
                    "receiver_library_epoch": receipt.receiverLibraryEpoch])
            }
        }
        guard remaining.isEmpty else { throw invalid("framed_sync_batch_receipt_missing") }
    }
    private static func invalid(_ code: String) -> Error { FolioleFramedSyncValidationError(code) }
}
