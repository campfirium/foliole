import Foundation

enum FolioleCompanionSyncGroupMemberStateEndpoint {
    struct Accepted {
        let body: Data
        let peer: String
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
            peer: peer
        )
    }

    private static func invalid(_ message: String) -> NSError {
        NSError(domain: "FolioleCompanionSyncGroupMemberState", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message])
    }
}
