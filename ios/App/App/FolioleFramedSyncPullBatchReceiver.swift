import Foundation
import FolioleFramedSyncRuntime

struct FolioleFramedSyncPullBatchReceiver {
    let receiver: FolioleFramedSyncTransferReceiver
    let context: FolioleFramedSyncTransferContext
    let groupKey: Data
    let owner: FolioleFramedSyncPayloadBudget
    let bridge: FolioleCompanionSyncGroupDataRequesting

    func receive(_ url: URL, requested: [FolioleFramedSyncPullBatchRequest.Object],
        acknowledge: (Data, FolioleFramedSyncPayloadBudget.Loan) async throws -> Void) async throws -> [[String: Any]] {
        var received = [[String: Any]](), transfers = Set<Data>()
        do { try await FolioleFramedSyncTransferSequence.readEachAsync(url, owner: owner) { unit in
            guard !unit.receipt, requested.indices.contains(received.count),
                  transfers.insert(unit.preamble.contextID).inserted else { throw invalid() }
            let request = requested[received.count]
            let result = try await FolioleFramedSyncPayloadWorker.run {
                let transfer = try receiver.receive(unit.url, groupKey: groupKey, context: context,
                    acceptHeader: request.accept)
                let applied = try receiver.withPublishedResources(transferID: transfer.transferID) { keys in
                    try bridge.request("apply_framed_transfer", [
                        "staging_kind": "ios", "staging_path": receiver.databaseURL.path,
                        "transfer_id": transfer.transferID.hex,
                        "sender_device_id": context.senderDeviceID, "sender_library_epoch": context.senderLibraryEpoch,
                        "receiver_device_id": context.receiverDeviceID, "receiver_library_epoch": context.receiverLibraryEpoch,
                        "resource_storage_keys": keys
                    ])
                }
                guard applied["transfer_id"] as? String == transfer.transferID.hex,
                      applied["receiver_device_id"] as? String == context.receiverDeviceID,
                      applied["receiver_library_epoch"] as? String == context.receiverLibraryEpoch else { throw invalid() }
                let loan = try FolioleFramedSyncPayloadWorker.borrow(owner, direction: .outbound, lane: .receipt)
                do { return (applied, try receiver.receipt(groupKey: groupKey, value: applied), loan) }
                catch { loan.release(); throw error }
            }
            defer { result.2.release() }
            try await acknowledge(result.1, result.2)
            received.append(["object_id": request.objectID, "object_type": request.objectType, "receipt": result.0])
        }
        } catch {
            guard !received.isEmpty, FolioleFramedSyncOutboundBatchSender.dependency(error) != nil else { throw error }
        }
        return received
    }

    private func invalid() -> Error { FolioleFramedSyncValidationError("framed_sync_pull_response_identity_mismatch") }
}
