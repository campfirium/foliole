import Foundation
import Network

extension FolioleCompanionSyncGroupJoinServer {
    func respondFramedTransfer(
        _ connection: NWConnection, _ request: FolioleCompanionHttpMessage,
        peer: String, localDevice: String, localEpoch: String,
        initiator: String, initiatorEpoch: String, groupKey: Data
    ) throws {
        guard let framedTransfers, let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
        let context = FolioleFramedSyncTransferContext(
            groupID: provider.groupId, senderDeviceID: initiator,
            senderLibraryEpoch: initiatorEpoch, receiverDeviceID: localDevice,
            receiverLibraryEpoch: localEpoch
        )
        let received: FolioleFramedSyncReceivedTransfer
        if let file = request.bodyFile {
            received = try framedTransfers.receive(file.url, groupKey: groupKey, context: context)
        } else {
            received = try framedTransfers.receive(request.bodyData, groupKey: groupKey, context: context)
        }
        let applied = try framedTransfers.withPublishedResources(
            transferID: received.transferID
        ) { resourceKeys in
            try dataBridge.request("apply_framed_transfer", [
                "staging_kind": "ios", "staging_path": framedTransfers.databaseURL.path,
                "transfer_id": received.transferID.hex,
                "sender_device_id": peer, "sender_library_epoch": initiatorEpoch,
                "receiver_device_id": localDevice, "receiver_library_epoch": localEpoch,
                "resource_storage_keys": resourceKeys
            ])
        }
        guard applied["transfer_id"] as? String == received.transferID.hex,
              applied["receiver_device_id"] as? String == localDevice,
              applied["receiver_library_epoch"] as? String == localEpoch else {
            throw Self.invalid("framed_sync_receipt_identity_mismatch")
        }
        let response = try framedTransfers.receipt(groupKey: groupKey, value: applied)
        let wire = FolioleCompanionHttpMessage.response(
            status: 200, contentType: FolioleFramedSyncHTTPTransport.contentType, body: response,
            headers: ["X-Foliole-Device-Id": localDevice, "X-Foliole-Library-Epoch": localEpoch]
        )
        connection.send(content: wire, completion: .contentProcessed { _ in connection.cancel() })
    }
}
