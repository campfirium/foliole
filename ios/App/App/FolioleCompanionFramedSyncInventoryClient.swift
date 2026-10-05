import Capacitor
import Foundation
import FolioleFramedSyncRuntime

extension FolioleCompanionSyncPlugin {
    @objc func readFramedSyncInventory(_ call: CAPPluginCall) {
        Task.detached { [weak self] in
            guard let self else { return call.reject("Companion Sync plugin is unavailable") }
            do { call.resolve(try await self.readRemoteFramedInventory(call)) }
            catch { call.reject("Failed to read framed Sync inventory: \(error.localizedDescription)", nil, error) }
        }
    }

    private func readRemoteFramedInventory(_ call: CAPPluginCall) async throws -> [String: Any] {
        let groupID = try framedRequired(call, "sync_group_id")
        let receiverDeviceID = try framedRequired(call, "receiver_device_id")
        let receiverEpoch = try framedRequired(call, "receiver_library_epoch")
        let credential = try groupData.request("load_current_credential", ["group_id": groupID])
        let senderDeviceID = try required(credential, "device_id")
        let workgroupKey = try required(credential, "workgroup_key")
        let state = try groupData.request("load_member_state", [:])
        let senderEpoch = try required(state, "library_epoch")
        let groupKey = try Base64URL.decode(workgroupKey)
        guard groupKey.count == 32 else { throw invalid("sync_group_key_invalid") }
        let context = try FolioleFramedSyncSessionContext(
            groupID: groupID, initiatorDeviceID: senderDeviceID,
            initiatorLibraryEpoch: senderEpoch, responderDeviceID: receiverDeviceID,
            responderLibraryEpoch: receiverEpoch
        )
        let local = try FolioleCompanionFramedSyncInventory.read(
            groupData.request("read_framed_inventory", [:])
        )
        let roundID = withUnsafeBytes(of: UUID().uuid) { Data($0) }
        let body = try FolioleFramedSyncSessionWriter.encode(
            groupKey: groupKey, context: context,
            messages: try FolioleFramedSyncInventoryWire.encode(entries: local, roundID: roundID)
        )
        let path = try framedPath(senderDeviceID, senderEpoch, receiverDeviceID, receiverEpoch)
        let response = try await framedPost(
            endpoint: try framedRequired(call, "endpoint_url"), path: path,
            peer: .init(
                groupID: groupID, deviceID: receiverDeviceID, libraryEpoch: receiverEpoch,
                memberAuthHeaders: framedHeaders(
                    groupID: groupID, deviceID: senderDeviceID,
                    workgroupKey: workgroupKey, path: path, body: body
                )
            ), body: body
        )
        let session = try FolioleFramedSyncSessionReader.read(
            response, groupKey: groupKey, context: context,
            maximumFrames: FolioleFramedSyncInventoryWire.maximumSessionFrames
        )
        guard try FolioleFramedSyncInventoryWire.decodeRoundID(session.messages) == roundID else {
            throw invalid("inventory_round_identity_mismatch")
        }
        return ["entries": try FolioleFramedSyncInventoryWire.decodeEntries(session.messages).map(project)]
    }

    private func project(_ entry: Foliole_Sync_V22_InventoryEntry) -> [String: Any] {
        [
            "frontier_fact_ids": entry.frontierFactIds,
            "global_id": entry.globalID,
            "object_type": entry.objectType,
            "required_relation_ids": entry.requiredRelationIds,
            "resource_hashes": entry.resourceHashes.map(\.hex),
            "review_fact_ids": entry.reviewFactIds,
            "shared_state_hash": entry.sharedStateHash.hex
        ]
    }
}
