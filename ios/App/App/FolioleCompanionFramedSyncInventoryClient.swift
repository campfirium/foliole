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
        let owner = try FolioleFramedSyncPayloadBudgetRegistry.shared.requireCurrent()
        let groupData = FolioleFramedSyncOwnedBridge(bridge: self.groupData, owner: owner)
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
        let local = try await FolioleFramedSyncPayloadWorker.run {
            try FolioleFramedSyncBridgeFactSource.metadata("read_framed_inventory", payload: [:], bridge: groupData, owner: owner,
                consume: FolioleCompanionFramedSyncInventory.read)
        }
        let roundID = withUnsafeBytes(of: UUID().uuid) { Data($0) }
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("foliole-framed-session-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let bodyURL = directory.appendingPathComponent("request.bin")
        try await FolioleFramedSyncPayloadWorker.run {
            try FolioleFramedSyncSessionWriter.writeFile(to: bodyURL, groupKey: groupKey, context: context, owner: owner) { emit in
                try FolioleFramedSyncInventoryWire.emit(entries: local, roundID: roundID,
                    detailGlobalIDs: call.getArray("detail_global_ids") as? [String] ?? [],
                    summaryOnly: call.getBool("summary_only") ?? false, consume: emit)
            }
        }
        let path = try framedPath(senderDeviceID, senderEpoch, receiverDeviceID, receiverEpoch)
        let headers = try await FolioleFramedSyncPayloadWorker.run {
            try self.framedHeaders(groupID: groupID, deviceID: senderDeviceID,
                workgroupKey: workgroupKey, path: path, bodyURL: bodyURL, owner: owner)
        }
        let entries = try await withFramedPostResponseFile(
            endpoint: try framedRequired(call, "endpoint_url"), path: path,
            peer: .init(groupID: groupID, deviceID: receiverDeviceID,
                libraryEpoch: receiverEpoch, memberAuthHeaders: headers), bodyURL: bodyURL, owner: owner
        ) { responseURL in
            guard let input = InputStream(url: responseURL) else { throw self.invalid("framed_sync_response_body_missing") }
            let inventory = FolioleFramedSyncInventoryWire.Reader(retainEntries: true)
            _ = try FolioleFramedSyncSessionReader.readEach(input, groupKey: groupKey, context: context,
                maximumFrames: FolioleFramedSyncInventoryWire.maximumSessionFrames, owner: owner, consume: inventory.accept)
            return try inventory.result(expectedRoundID: roundID)
        }
        return [
            "entries": entries.map(project),
            "round_id": roundID.hex
        ]
    }

    private func pullRemoteFramedObject(_ call: CAPPluginCall) async throws -> [String: Any] {
        let owner = try FolioleFramedSyncPayloadBudgetRegistry.shared.requireCurrent()
        let groupData = FolioleFramedSyncOwnedBridge(bridge: self.groupData, owner: owner)
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
            stateFactIDs: framedArray(call, "state_fact_ids"), objectType: framedRequired(call, "object_type"),
            resources: FolioleCompanionFramedSyncResourceRequest.read(call.options["resources"])
        )
        let requestDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("foliole-framed-pull-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: requestDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: requestDirectory) }
        let requestURL = requestDirectory.appendingPathComponent("request.bin")
        try await FolioleFramedSyncPayloadWorker.run {
            try FolioleFramedSyncSessionWriter.writeFile(to: requestURL, groupKey: groupKey, context: sessionContext, owner: owner) { emit in try emit(request) }
        }
        let path = try framedPath(localDeviceID, localEpoch, remoteDeviceID, remoteEpoch)
        let transferContext = FolioleFramedSyncTransferContext(
            groupID: groupID, senderDeviceID: remoteDeviceID, senderLibraryEpoch: remoteEpoch,
            receiverDeviceID: localDeviceID, receiverLibraryEpoch: localEpoch
        )
        let receiver = try FolioleFramedSyncTransferReceiver(
            database: FolioleFramedSyncTransferDatabase(url: framedInboundDatabaseURL()), owner: owner
        )
        let requestHeaders = try await FolioleFramedSyncPayloadWorker.run {
            try self.framedHeaders(groupID: groupID, deviceID: localDeviceID, workgroupKey: workgroupKey,
                path: path, bodyURL: requestURL, owner: owner)
        }
        let received = try await withFramedPostResponseFile(
            endpoint: endpoint, path: path,
            peer: .init(groupID: groupID, deviceID: remoteDeviceID, libraryEpoch: remoteEpoch, memberAuthHeaders: requestHeaders),
            bodyURL: requestURL, owner: owner
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
        let receiptLoan = try await FolioleFramedSyncPayloadWorker.run {
            try FolioleFramedSyncPayloadWorker.borrow(owner, direction: .outbound, lane: .receipt)
        }
        defer { receiptLoan.release() }
        let receiptBody = try receiver.receipt(groupKey: groupKey, value: applied)
        _ = try await framedPost(
            endpoint: endpoint, path: path,
            peer: framedPeer(groupID, remoteDeviceID, remoteEpoch, localDeviceID, workgroupKey, path, receiptBody),
            body: receiptBody, owner: owner, requestLoan: receiptLoan
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

    private func project(_ entry: Foliole_Sync_V22_InventoryEntry) -> [String: Any] {
        [
            "frontier_fact_ids": entry.frontierFactIds,
            "global_id": entry.globalID,
            "object_type": entry.objectType,
            "required_relation_ids": entry.requiredRelationIds,
            "resource_hashes": entry.resourceHashes.map(\.hex),
            "review_fact_ids": entry.reviewFactIds,
            "state_fact_ids": entry.stateFactIds,
            "version_states": entry.versionStates,
            "current_version_id": entry.currentVersionID,
            "unready": entry.unready,
            "shared_state_hash": entry.sharedStateHash.hex
        ]
    }
}
