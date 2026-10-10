import Foundation
import FolioleFramedSyncRuntime
import Network

extension FolioleCompanionSyncGroupJoinServer {
    func respondFramedSession(_ connection: NWConnection, _ request: FolioleCompanionHttpMessage,
        groupKey: Data, context: FolioleFramedSyncSessionContext, peer: String, peerEpoch: String,
        localDevice: String, localEpoch: String, owner: FolioleFramedSyncPayloadBudget) throws {
        guard let rawBridge = dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
        let dataBridge = FolioleFramedSyncOwnedBridge(bridge: rawBridge, owner: owner)
        let incoming = try FolioleFramedSyncSessionRequest.read(
            request.bodyStream(), groupKey: groupKey, context: context, owner: owner)
        switch incoming {
        case .inventory(let begin):
            let inventory = try FolioleFramedSyncBridgeFactSource.metadata("read_framed_inventory", payload: [
                "group_id": provider.groupId, "peer_device_id": peer, "peer_library_epoch": peerEpoch
            ], bridge: dataBridge, owner: owner, consume: FolioleCompanionFramedSyncInventory.read)
            try FolioleFramedSyncFileResponse.inventory(connection, groupKey: groupKey, context: context,
                entries: begin.detailGlobalIds.isEmpty ? inventory : inventory.filter {
                    $0.objectType == "node" && begin.detailGlobalIds.contains($0.globalID)
                }, roundID: begin.roundID, summaryOnly: begin.detailGlobalIds.isEmpty && begin.summaryOnly,
                deviceID: localDevice, epoch: localEpoch, owner: owner)
        case .difference(let encoded):
            try respondDifferences(connection, encoded: [encoded], bridge: dataBridge, groupKey: groupKey, peer: peer,
                peerEpoch: peerEpoch, localDevice: localDevice, localEpoch: localEpoch, owner: owner)
        case .differences(let encoded):
            try respondDifferences(connection, encoded: encoded, bridge: dataBridge, groupKey: groupKey, peer: peer,
                peerEpoch: peerEpoch, localDevice: localDevice, localEpoch: localEpoch, owner: owner)
        }
    }

    private func respondDifferences(_ connection: NWConnection, encoded: [Data], bridge: FolioleCompanionSyncGroupDataRequesting,
        groupKey: Data, peer: String, peerEpoch: String, localDevice: String, localEpoch: String,
        owner: FolioleFramedSyncPayloadBudget) throws {
        let transferContext = FolioleFramedSyncTransferContext(groupID: provider.groupId,
            senderDeviceID: localDevice, senderLibraryEpoch: localEpoch,
            receiverDeviceID: peer, receiverLibraryEpoch: peerEpoch)
        try FolioleCompanionFramedSyncServerOutbound.respond(connection, bridge: bridge,
            context: transferContext, groupKey: groupKey, requests: encoded, owner: owner)
    }
}
