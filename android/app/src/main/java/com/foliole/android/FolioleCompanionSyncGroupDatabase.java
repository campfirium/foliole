package com.foliole.android;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncGroupDatabase {
    private FolioleCompanionSyncGroupDatabase() {}

    static JSONObject registerMember(
        FolioleCompanionSyncGroupDataBridge bridge,
        String groupId,
        String approvedByHostName,
        FolioleCompanionSyncGroupJoinRequest request
    ) throws Exception {
        JSONObject member = new JSONObject()
            .put("authorization_id", request.pairRequestId)
            .put("host_platform", request.hostPlatform)
            .put("host_name", request.hostName)
            .put("joined_at", request.requestedAt);
        JSONObject result = bridge.request("authorize_member", new JSONObject()
            .put("approved_by_host_name", approvedByHostName)
            .put("host_name", request.hostName)
            .put("group_id", groupId)
            .put("member", member));
        if (!result.optBoolean("authorized")) throw new SecurityException("sync_group_member_not_authorized");
        return result;
    }

    static boolean isAuthorizedMember(FolioleCompanionSyncGroupDataBridge bridge, String groupId, String hostName) {
        try {
            return bridge.request("authorize_member", new JSONObject()
                .put("host_name", hostName).put("group_id", groupId)).optBoolean("authorized");
        } catch (Exception error) {
            return false;
        }
    }

    static JSONObject groupForApprovedRequest(
        FolioleCompanionSyncGroupDataBridge bridge,
        String approvedByHostName,
        FolioleCompanionSyncGroupJoinRequest request
    ) throws Exception {
        JSONObject loaded = bridge.request("load_group", new JSONObject());
        JSONObject row = loaded.getJSONObject("group");
        JSONObject group = new JSONObject()
            .put("group_id", row.getString("group_id"))
            .put("display_name", row.getString("display_name"))
            .put("timeline_id", row.getString("timeline_id"))
            .put("created_by_host_name", row.getString("created_by_host_name"))
            .put("created_at", row.getString("created_at"))
            .put("local_host_name", request.hostName);
        JSONArray members = loaded.getJSONArray("members");
        boolean found = false;
        for (int index = 0; index < members.length(); index++) {
            found |= request.hostName.equals(members.getJSONObject(index).getString("host_name"));
        }
        if (!found) members.put(new JSONObject().put("host_name", request.hostName)
            .put("host_platform", request.hostPlatform).put("state", "active")
            .put("approved_by_host_name", approvedByHostName).put("authorization_id", request.pairRequestId)
            .put("joined_at", request.requestedAt));
        return group.put("local_member_state", "active").put("members", members);
    }

    static void recordSupplyCursor(
        FolioleCompanionSyncGroupDataBridge bridge, String peerId, int fromCursor, int toCursor
    ) throws Exception {
        bridge.request("record_supply_cursor", new JSONObject().put("peer_id", peerId)
            .put("from_cursor", fromCursor).put("to_cursor", toCursor));
    }

    static void recordDeparture(
        FolioleCompanionSyncGroupDataBridge bridge, String groupId, JSONObject value
    ) throws Exception {
        bridge.request("record_departure", new JSONObject().put("group_id", groupId).put("value", value));
    }

    static void requireAuthorizedMember(
        FolioleCompanionSyncGroupDataBridge bridge, String groupId, String hostName
    ) throws Exception {
        if (!isAuthorizedMember(bridge, groupId, hostName)) {
            throw new SecurityException("sync_group_member_not_authorized");
        }
    }

    static void saveSyncEndpoint(
        FolioleCompanionSyncGroupDataBridge bridge, String endpointUrl, String now
    ) throws Exception {
        bridge.request("save_sync_endpoint", new JSONObject()
            .put("endpoint_url", endpointUrl).put("updated_at", now));
    }
}
