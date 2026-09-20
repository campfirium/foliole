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
            memberStateReady.insert(accepted.peer)
            try sendWorkgroup(connection, request, "application/json; charset=utf-8", accepted.body)
            stateChanged()
            return
        }
        if request.method == "GET" && route == "/companion/sync-pack" {
            guard let snapshots, let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
            let peer = try authenticate(request)
            let after = Int(Self.query(request.path, "after_state_seq") ?? "0") ?? 0
            let result = try snapshots.refresh(peer) { snapshot in
                try FolioleCompanionSyncPackProvider.build(
                    snapshot: snapshot,
                    fromDevice: try Self.requiredDiscovery(discovery, "provider_device_id"),
                    toDevice: peer, fromSequence: after
                )
            }
            _ = try dataBridge.request("record_supply_cursor", [
                "from_cursor": after, "peer_id": peer, "to_cursor": result.toSequence
            ])
            return try sendWorkgroup(connection, request, "application/zip", result.body)
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

    private func authenticate(_ request: FolioleCompanionHttpMessage) throws -> String {
        guard let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
        let peer = try FolioleCompanionSyncGroupWorkgroup.authenticate(
            request, groupId: provider.groupId, workgroupKey: provider.workgroupKey,
            dataBridge: dataBridge
        )
        guard memberStateReady.contains(peer) else {
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
            return try FolioleCompanionSyncGroupResources.attachment(
                snapshot: snapshot, attachmentId: Self.query(request.path, "attachment_id"),
                contentHash: Self.query(request.path, "content_hash")
            )
        }
        guard let resource else {
            let body = try JSONSerialization.data(withJSONObject: ["error": kind == "blob" ? "blob_not_found" : "missing_file"])
            return try sendWorkgroup(connection, request, "application/json; charset=utf-8", body, status: 404)
        }
        try sendWorkgroup(connection, request, resource.contentType, resource.body)
    }

}
