import Foundation
import Network

extension FolioleCompanionSyncGroupJoinServer {
    func respond(_ connection: NWConnection, _ request: FolioleCompanionHttpMessage) throws {
        let route = request.path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? request.path
        if request.method == "GET" && route == "/health" { return try send(connection, 200, ["ok": true]) }
        if request.method == "GET" && route == "/companion/discovery" {
            return try send(connection, 200, FolioleCompanionSyncGroupDiscoveryPayload.make(discovery))
        }
        if request.method == "POST" && route == "/sync-group/join-requests" {
            guard let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
            _ = try dataBridge.request("validate_join", request.body)
            let created = try provider.receive(request.body)
            stateChanged()
            return try send(connection, 202, created)
        }
        if request.method == "POST" && route == "/sync-group/join-acceptance" {
            let requestId = try FolioleCompanionSyncGroupJoinRequest.required(request.body, "request_id")
            guard let accepted = try provider.collect(requestId) else {
                return try send(connection, 409, ["error": "sync_group_join_request_pending"])
            }
            stateChanged()
            return try send(connection, 200, accepted)
        }
        if request.method == "POST" && route == "/sync-group/member-state" {
            guard let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
            let accepted = try FolioleCompanionSyncGroupMemberStateEndpoint.accept(
                request, bridge: dataBridge, groupId: provider.groupId,
                groupTag: try Self.requiredDiscovery(discovery, "group_tag"),
                workgroupKey: provider.workgroupKey
            )
            if accepted.normalSyncReady { memberStateReady[accepted.peer] = accepted.restoreId }
            else { memberStateReady.removeValue(forKey: accepted.peer) }
            try sendWorkgroup(connection, request, "application/json; charset=utf-8", accepted.body)
            stateChanged()
            return
        }
        if request.method == "POST" && route == "/companion/framed-sync" {
            return try respondFramedSync(connection, request)
        }
        if request.method == "GET" && FolioleCompanionSyncIdentityRoutes.supports(route) {
            return try respondIdentity(connection, request)
        }
        if request.method == "POST" && route == "/companion/sync-identity-pack" {
            return try respondIdentityPack(connection, request)
        }
        if request.method == "POST" && route == "/companion/sync-identity-push" {
            return try respondIdentityPush(connection, request)
        }
        if request.method == "GET" && route == "/companion/sync-pack" {
            guard let snapshots, let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
            let peer = try authenticate(request)
            guard Self.query(request.path, "page_contract") == "bounded-v1" else {
                throw Self.invalid("sync_pack_page_contract_required")
            }
            let after = Int(Self.query(request.path, "after_state_seq") ?? "0") ?? 0
            let frontier = Self.query(request.path, "frontier_state_seq").flatMap(Int.init)
            let epoch = Self.query(request.path, "source_epoch")
            let indexId = Self.query(request.path, "fact_index_id")
            let selectedTo = Self.query(request.path, "to_state_seq").flatMap(Int.init)
            guard let indexId, !indexId.isEmpty else {
                return try send(connection, 409, ["error": "sync_pack_fact_probe_required"])
            }
            guard (frontier == nil) == (epoch == nil) else { throw Self.invalid("invalid_sync_pack_page_request") }
            let build: (URL) throws -> FolioleCompanionSyncPackProvider.Result = { snapshot in
                try FolioleCompanionSyncPackProvider.build(
                    snapshot: snapshot,
                    fromDevice: try Self.requiredDiscovery(self.discovery, "provider_device_id"),
                    toDevice: peer, fromSequence: after,
                    requestedFrontier: frontier, requestedEpoch: epoch,
                    selectedTo: selectedTo, expectedIndex: indexId,
                    versionBits: Self.query(request.path, "have_v"),
                    parentBits: Self.query(request.path, "have_p"),
                    reviewBits: Self.query(request.path, "have_r")
                )
            }
            let result: FolioleCompanionSyncPackProvider.Result
            do {
                if frontier == nil { result = try snapshots.refresh(peer, work: build) }
                else { result = try snapshots.continueOrRefresh(peer, work: build) }
            } catch {
                let code = (error as NSError).domain
                guard code.hasPrefix("sync_pack_fact_") else { throw error }
                let body = try JSONSerialization.data(withJSONObject: ["error": code])
                return try sendWorkgroup(connection, request,
                    "application/json; charset=utf-8", body, status: 409)
            }
            _ = try dataBridge.request("stage_version_pack", result.holds)
            _ = try dataBridge.request("record_supply_cursor", [
                "from_cursor": after, "peer_id": peer, "to_cursor": result.toSequence
            ])
            return try sendWorkgroup(connection, request, "application/zip", result.body)
        }
        if request.method == "GET" && route == "/companion/sync-pack-facts" {
            guard let snapshots else { throw Self.invalid("sync_group_data_owner_unavailable") }
            let peer = try authenticate(request)
            guard Self.query(request.path, "page_contract") == "bounded-v1" else {
                throw Self.invalid("sync_pack_page_contract_required")
            }
            let after = Int(Self.query(request.path, "after_state_seq") ?? "0") ?? 0
            let frontier = Self.query(request.path, "frontier_state_seq").flatMap(Int.init)
            let epoch = Self.query(request.path, "source_epoch")
            guard (frontier == nil) == (epoch == nil) else { throw Self.invalid("invalid_sync_pack_fact_request") }
            let build: (URL) throws -> [String: Any] = { snapshot in
                try FolioleCompanionSyncPackFactProvider.index(
                    snapshot: snapshot, from: after, requestedFrontier: frontier, requestedEpoch: epoch
                )
            }
            let index = frontier == nil ? try snapshots.refresh(peer, work: build)
                : try snapshots.continueOrRefresh(peer, work: build)
            let body = try JSONSerialization.data(withJSONObject: index, options: [.sortedKeys])
            return try sendWorkgroup(connection, request, "application/json; charset=utf-8", body)
        }
        if request.method == "POST" && route == "/companion/version-pack-receipt" {
            guard let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
            let peer = try authenticate(request)
            let plaintext = try FolioleCompanionSyncGroupWorkgroup.decryptRequest(
                request, groupTag: try Self.requiredDiscovery(discovery, "group_tag"),
                workgroupKey: provider.workgroupKey
            )
            let receipt = try JSONSerialization.jsonObject(with: plaintext) as? [String: Any]
            guard let receipt else { throw Self.invalid("node_version_receipt_invalid") }
            do {
                let result = try dataBridge.request("confirm_version_pack", [
                    "authenticated_device_id": peer, "receipt": receipt
                ])
                let body = try JSONSerialization.data(withJSONObject: result)
                return try sendWorkgroup(connection, request, "application/json; charset=utf-8", body)
            } catch {
                let body = try JSONSerialization.data(withJSONObject: ["error": error.localizedDescription])
                return try sendWorkgroup(connection, request, "application/json; charset=utf-8", body, status: 409)
            }
        }
        if request.method == "POST" && route == "/companion/resource-availability" {
            return try resourceAvailability(connection, request)
        }
        if request.method == "POST" && route == "/companion/content-blobs" {
            guard let snapshots else { throw Self.invalid("sync_group_data_owner_unavailable") }
            let peer = try authenticate(request)
            let plaintext = try FolioleCompanionSyncGroupWorkgroup.decryptRequest(
                request, groupTag: try Self.requiredDiscovery(discovery, "group_tag"),
                workgroupKey: provider.workgroupKey
            )
            let resource = try snapshots.read(peer) {
                try FolioleCompanionSyncGroupResources.contentBlobBatch(snapshot: $0, requestData: plaintext)
            }
            return try sendWorkgroup(connection, request, resource.contentType, resource.body)
        }
        if request.method == "GET" && route == "/companion/content-blob" {
            return try sendResource(connection, request, kind: "blob")
        }
        if request.method == "GET" && route == "/companion/attachment-resource" {
            return try sendResource(connection, request, kind: "attachment")
        }
        try send(connection, 404, ["error": "not_found"])
    }

    private func resourceAvailability(_ connection: NWConnection, _ request: FolioleCompanionHttpMessage) throws {
        let peer = try authenticate(request)
        guard let snapshots else { throw Self.invalid("sync_group_data_owner_unavailable") }
        let plaintext = try FolioleCompanionSyncGroupWorkgroup.decryptRequest(request,
            groupTag: try Self.requiredDiscovery(discovery, "group_tag"), workgroupKey: provider.workgroupKey)
        do {
            let body = try snapshots.refresh(peer) {
                try FolioleCompanionResourceAvailability.reply(snapshot: $0, request: plaintext,
                    deviceId: Self.requiredDiscovery(discovery, "provider_device_id"))
            }
            try sendWorkgroup(connection, request, "application/json; charset=utf-8", body)
        } catch {
            let body = try JSONSerialization.data(withJSONObject: ["error": error.localizedDescription])
            try sendWorkgroup(connection, request, "application/json; charset=utf-8", body, status: 400)
        }
    }

    func authenticate(_ request: FolioleCompanionHttpMessage) throws -> String {
        guard let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
        let peer = try FolioleCompanionSyncGroupWorkgroup.authenticate(
            request, groupId: provider.groupId, workgroupKey: provider.workgroupKey,
            dataBridge: dataBridge
        )
        guard let approvedRestore = memberStateReady[peer] else {
            throw Self.invalid("sync_group_member_state_required")
        }
        let current = try dataBridge.request("load_member_state", [:])
        let restore = current["restore"] as? [String: Any]
        guard restore == nil || restore?["applied"] as? Bool == true,
              approvedRestore == FolioleCompanionSyncGroupMemberStateEndpoint.restoreId(current) else {
            memberStateReady.removeValue(forKey: peer)
            throw Self.invalid("sync_group_member_state_required")
        }
        return peer
    }

    private func sendResource(
        _ connection: NWConnection, _ request: FolioleCompanionHttpMessage, kind: String
    ) throws {
        let peer = try authenticate(request)
        guard let snapshots else { throw Self.invalid("sync_group_data_owner_unavailable") }
        let resource = try snapshots.read(peer) { snapshot in
            if kind == "blob" {
                return try FolioleCompanionSyncGroupResources.contentBlob(
                    snapshot: snapshot, hash: Self.query(request.path, "hash")
                )
            }
            return try FolioleCompanionSyncGroupResources.attachmentRange(
                attachmentId: Self.query(request.path, "attachment_id"),
                contentHash: Self.query(request.path, "content_hash"),
                storageKey: Self.query(request.path, "storage_key"),
                offsetText: Self.query(request.path, "offset"),
                lengthText: Self.query(request.path, "length")
            )
        }
        guard let resource else {
            let body = try JSONSerialization.data(withJSONObject: ["error": kind == "blob" ? "blob_not_found" : "missing_file"])
            return try sendWorkgroup(connection, request, "application/json; charset=utf-8", body, status: 404)
        }
        try sendWorkgroup(connection, request, resource.contentType, resource.body,
            totalBytes: resource.totalBytes)
    }

}
