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

    @objc func pullFramedSyncObject(_ call: CAPPluginCall) {
        Task.detached { [weak self] in
            guard let self else { return call.reject("Companion Sync plugin is unavailable") }
            do { call.resolve(try await self.pullRemoteFramedObject(call)) }
            catch { call.reject("Failed to pull framed Sync object: \(error.localizedDescription)", nil, error) }
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
        return [
            "entries": try FolioleFramedSyncInventoryWire.decodeEntries(session.messages).map(project),
            "round_id": roundID.hex
        ]
    }

    private func pullRemoteFramedObject(_ call: CAPPluginCall) async throws -> [String: Any] {
        let groupID = try framedRequired(call, "sync_group_id")
        let endpoint = try framedRequired(call, "endpoint_url")
        let remoteDeviceID = try framedRequired(call, "receiver_device_id")
        let remoteEpoch = try framedRequired(call, "receiver_library_epoch")
        let credential = try groupData.request("load_current_credential", ["group_id": groupID])
        let localDeviceID = try required(credential, "device_id")
        let workgroupKey = try required(credential, "workgroup_key")
        let state = try groupData.request("load_member_state", [:])
        let localEpoch = try required(state, "library_epoch")
        let groupKey = try Base64URL.decode(workgroupKey)
        guard groupKey.count == 32 else { throw invalid("sync_group_key_invalid") }
        let sessionContext = try FolioleFramedSyncSessionContext(
            groupID: groupID, initiatorDeviceID: localDeviceID,
            initiatorLibraryEpoch: localEpoch, responderDeviceID: remoteDeviceID,
            responderLibraryEpoch: remoteEpoch
        )
        let request = try FolioleFramedSyncDifferenceRequest.make(
            roundID: framedHex(call, "round_id", byteCount: 16),
            objectID: framedRequired(call, "object_id"),
            frontierFactIDs: framedArray(call, "frontier_fact_ids"),
            requiredRelationIDs: framedArray(call, "required_relation_ids"),
            resourceHashes: framedDigests(call, "resource_hashes"),
            reviewFactIDs: framedArray(call, "review_fact_ids"),
            stateFactIDs: framedArray(call, "state_fact_ids"), objectType: framedRequired(call, "object_type")
        )
        let requestBody = try FolioleFramedSyncSessionWriter.encode(
            groupKey: groupKey, context: sessionContext, messages: [request]
        )
        let path = try framedPath(localDeviceID, localEpoch, remoteDeviceID, remoteEpoch)
        let transferContext = FolioleFramedSyncTransferContext(
            groupID: groupID, senderDeviceID: remoteDeviceID, senderLibraryEpoch: remoteEpoch,
            receiverDeviceID: localDeviceID, receiverLibraryEpoch: localEpoch
        )
        let receiver = try FolioleFramedSyncTransferReceiver(
            database: FolioleFramedSyncTransferDatabase(url: framedInboundDatabaseURL())
        )
        let received = try await withFramedPostResponseFile(
            endpoint: endpoint, path: path,
            peer: framedPeer(groupID, remoteDeviceID, remoteEpoch, localDeviceID, workgroupKey, path, requestBody),
            body: requestBody
        ) { responseURL in
            try receiver.receive(responseURL, groupKey: groupKey, context: transferContext)
        }
        if call.getBool("stage_only") == true {
            return try receiver.withPublishedResources(transferID: received.transferID) { resourceKeys in
                ["staging_kind": "ios", "staging_path": receiver.databaseURL.path,
                 "transfer_id": received.transferID.hex,
                 "sender_device_id": remoteDeviceID, "sender_library_epoch": remoteEpoch,
                 "receiver_device_id": localDeviceID, "receiver_library_epoch": localEpoch,
                 "resource_storage_keys": resourceKeys]
            }
        }
        let applied = try receiver.withPublishedResources(
            transferID: received.transferID
        ) { resourceKeys in
            try groupData.request("apply_framed_transfer", [
                "staging_kind": "ios", "staging_path": receiver.databaseURL.path,
                "transfer_id": received.transferID.hex,
                "sender_device_id": remoteDeviceID, "sender_library_epoch": remoteEpoch,
                "receiver_device_id": localDeviceID, "receiver_library_epoch": localEpoch,
                "resource_storage_keys": resourceKeys
            ])
        }
        try requireReceipt(applied, transferID: received.transferID, receiver: localDeviceID, epoch: localEpoch)
        let receiptBody = try receiver.receipt(groupKey: groupKey, value: applied)
        _ = try await framedPost(
            endpoint: endpoint, path: path,
            peer: framedPeer(groupID, remoteDeviceID, remoteEpoch, localDeviceID, workgroupKey, path, receiptBody),
            body: receiptBody
        )
        return applied
    }

    private func framedPeer(
        _ groupID: String, _ remoteDeviceID: String, _ remoteEpoch: String,
        _ localDeviceID: String, _ workgroupKey: String, _ path: String, _ body: Data
    ) -> FolioleFramedSyncHTTPPeer {
        .init(groupID: groupID, deviceID: remoteDeviceID, libraryEpoch: remoteEpoch,
              memberAuthHeaders: framedHeaders(groupID: groupID, deviceID: localDeviceID,
                                                workgroupKey: workgroupKey, path: path, body: body))
    }

    private func requireReceipt(
        _ value: [String: Any], transferID: Data, receiver: String, epoch: String
    ) throws {
        guard value["transfer_id"] as? String == transferID.hex,
              value["receiver_device_id"] as? String == receiver,
              value["receiver_library_epoch"] as? String == epoch else {
            throw invalid("framed_sync_receipt_identity_mismatch")
        }
    }

    private func framedArray(_ call: CAPPluginCall, _ key: String) throws -> [String] {
        guard let raw = call.getArray(key) else { throw invalid("\(key)_required") }
        let result = raw.compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard result.count == raw.count, result.allSatisfy({ !$0.isEmpty }), Set(result).count == result.count
        else { throw invalid("\(key)_invalid") }
        return result
    }

    private func framedDigests(_ call: CAPPluginCall, _ key: String) throws -> [Data] {
        try framedArray(call, key).map { try framedHex($0, key, byteCount: 32) }
    }

    private func framedHex(_ call: CAPPluginCall, _ key: String, byteCount: Int) throws -> Data {
        try framedHex(framedRequired(call, key), key, byteCount: byteCount)
    }

    private func framedHex(_ value: String, _ key: String, byteCount: Int) throws -> Data {
        guard value.count == byteCount * 2,
              value.range(of: "^[a-f0-9]+$", options: .regularExpression) != nil else {
            throw invalid("\(key)_invalid")
        }
        var result = Data(capacity: byteCount)
        for offset in stride(from: 0, to: value.count, by: 2) {
            let start = value.index(value.startIndex, offsetBy: offset)
            guard let byte = UInt8(value[start..<value.index(start, offsetBy: 2)], radix: 16) else {
                throw invalid("\(key)_invalid")
            }
            result.append(byte)
        }
        return result
    }

    private func framedInboundDatabaseURL() throws -> URL {
        let root = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true
        )
        return root.appendingPathComponent("Foliole/framed-sync/ios-transfer.db")
    }

    private func project(_ entry: Foliole_Sync_V22_InventoryEntry) -> [String: Any] {
        [
            "frontier_fact_ids": entry.frontierFactIds,
            "global_id": entry.globalID,
            "object_type": entry.objectType,
            "required_relation_ids": entry.requiredRelationIds,
            "resource_hashes": entry.resourceHashes.map(\.hex),
            "review_fact_ids": entry.reviewFactIds,
            "state_fact_ids": entry.stateFactIds,
            "shared_state_hash": entry.sharedStateHash.hex
        ]
    }
}
