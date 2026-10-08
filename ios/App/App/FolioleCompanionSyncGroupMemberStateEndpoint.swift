import Foundation

enum FolioleCompanionSyncGroupMemberStateEndpoint {
    struct Accepted {
        let body: Data
        let peer: String
        let normalSyncReady: Bool
        let restoreId: String
    }

    static func accept(
        _ request: FolioleCompanionHttpMessage,
        bridge: FolioleCompanionSyncGroupDataRequesting,
        groupId: String,
        groupTag: String,
        workgroupKey: String
    ) throws -> Accepted {
        let peer = try FolioleCompanionSyncGroupWorkgroup.authenticate(
            request, groupId: groupId, workgroupKey: workgroupKey,
            dataBridge: bridge, allowUnknownDevice: true
        )
        return try apply(request, peer: peer, bridge: bridge, groupTag: groupTag, workgroupKey: workgroupKey)
    }

    static func apply(_ request: FolioleCompanionHttpMessage, peer: String,
        bridge: FolioleCompanionSyncGroupDataRequesting, groupTag: String, workgroupKey: String) throws -> Accepted {
        let plaintext = try FolioleCompanionSyncGroupWorkgroup.decryptRequest(
            request, groupTag: groupTag, workgroupKey: workgroupKey
        )
        guard let state = try JSONSerialization.jsonObject(with: plaintext) as? [String: Any] else {
            throw invalid("sync_group_member_state_invalid")
        }
        let applied = try bridge.request("apply_member_state", [
            "authenticated_device_id": peer, "state": state
        ])
        guard let responseState = applied["state"] as? [String: Any] else {
            throw invalid("sync_group_member_state_invalid")
        }
        return try Accepted(
            body: JSONSerialization.data(withJSONObject: responseState, options: [.sortedKeys]),
            peer: peer,
            normalSyncReady: applied["normal_sync_ready"] as? Bool ?? false,
            restoreId: restoreId(responseState)
        )
    }

    static func restoreId(_ state: [String: Any]) -> String {
        let restore = state["restore"] as? [String: Any]
        let event = restore?["event"] as? [String: Any]
        return event?["restore_id"] as? String ?? ""
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncGroupMemberState", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}
