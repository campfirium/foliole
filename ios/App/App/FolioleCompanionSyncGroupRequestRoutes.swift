import Foundation
import Network

extension FolioleCompanionSyncGroupJoinServer {
    func respond(_ connection: NWConnection, _ request: FolioleCompanionHttpMessage) throws {
        let route = request.path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? request.path
        if request.method == "GET" && route == "/health" {
            return try send(connection, 200, ["ok": true])
        }
        if request.method == "GET" && route == "/companion/discovery" {
            return try send(
                connection,
                200,
                FolioleCompanionSyncGroupDiscoveryPayload.make(discovery)
            )
        }
        if request.method == "POST" && route == "/sync-group/join-requests" {
            guard let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
            _ = try dataBridge.request("validate_join", request.body)
            let created = try provider.receive(request.body)
            stateChanged()
            return try send(connection, 202, created)
        }
        if request.method == "POST" && route == "/sync-group/join-acceptance" {
            let requestId = try FolioleCompanionSyncGroupJoinRequest.required(
                request.body,
                "request_id"
            )
            guard let accepted = try provider.collect(requestId) else {
                return try send(connection, 409, ["error": "sync_group_join_request_pending"])
            }
            stateChanged()
            return try send(connection, 200, accepted)
        }
        if request.method == "POST" && route == "/sync-group/member-state" {
            guard let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
            let accepted = try FolioleCompanionSyncGroupMemberStateEndpoint.accept(
                request,
                bridge: dataBridge,
                groupId: provider.groupId,
                groupTag: try Self.requiredDiscovery(discovery, "group_tag"),
                workgroupKey: provider.workgroupKey
            )
            if accepted.normalSyncReady {
                memberStateReady[accepted.peer] = accepted.restoreId
            } else {
                memberStateReady.removeValue(forKey: accepted.peer)
            }
            try sendWorkgroup(
                connection,
                request,
                "application/json; charset=utf-8",
                accepted.body
            )
            stateChanged()
            return
        }
        if request.method == "POST" && route == "/companion/framed-sync" {
            return try respondFramedSync(connection, request)
        }
        try send(connection, 404, ["error": "not_found"])
    }

    func authenticate(_ request: FolioleCompanionHttpMessage) throws -> String {
        guard let dataBridge else { throw Self.invalid("sync_group_data_owner_unavailable") }
        let peer = try FolioleCompanionSyncGroupWorkgroup.authenticate(
            request,
            groupId: provider.groupId,
            workgroupKey: provider.workgroupKey,
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
}
