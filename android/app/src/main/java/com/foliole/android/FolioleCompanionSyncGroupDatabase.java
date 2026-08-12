package com.foliole.android;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncGroupDatabase {
    private FolioleCompanionSyncGroupDatabase() {}

    static JSONObject registerMember(
        FolioleCompanionSyncGroupDataBridge bridge,
        String groupId,
        String approvedByDeviceId,
        FolioleCompanionSyncGroupJoinRequest request
    ) throws Exception {
        JSONObject member = new JSONObject()
            .put("authorization_id", request.pairRequestId)
            .put("device_kind", request.deviceKind)
            .put("device_name", request.deviceName)
            .put("joined_at", request.requestedAt);
        JSONObject result = bridge.request("authorize_member", new JSONObject()
            .put("approved_by_device_id", approvedByDeviceId)
            .put("device_id", request.deviceId)
            .put("group_id", groupId)
            .put("member", member));
        if (!result.optBoolean("authorized")) throw new SecurityException("sync_group_member_not_authorized");
        return result;
    }

    static boolean isAuthorizedMember(FolioleCompanionSyncGroupDataBridge bridge, String groupId, String deviceId) {
        try {
            return bridge.request("authorize_member", new JSONObject()
                .put("device_id", deviceId).put("group_id", groupId)).optBoolean("authorized");
        } catch (Exception error) {
            return false;
        }
    }

    static JSONObject groupForApprovedRequest(
        FolioleCompanionSyncGroupDataBridge bridge,
        String approvedByDeviceId,
        FolioleCompanionSyncGroupJoinRequest request
    ) throws Exception {
        JSONObject loaded = bridge.request("load_group", new JSONObject());
        JSONObject row = loaded.getJSONObject("group");
        JSONObject group = new JSONObject()
            .put("group_id", row.getString("group_id"))
            .put("display_name", row.getString("display_name"))
            .put("timeline_id", row.getString("timeline_id"))
            .put("created_by_device_id", row.getString("created_by_device_id"))
            .put("created_at", row.getString("created_at"))
            .put("local_device_id", request.deviceId);
        JSONArray members = loaded.getJSONArray("members");
        boolean found = false;
        for (int index = 0; index < members.length(); index++) {
            found |= request.deviceId.equals(members.getJSONObject(index).getString("device_id"));
        }
        if (!found) members.put(new JSONObject().put("device_id", request.deviceId)
            .put("device_kind", request.deviceKind).put("device_name", request.deviceName).put("state", "active")
            .put("approved_by_device_id", approvedByDeviceId).put("authorization_id", request.pairRequestId)
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
        FolioleCompanionSyncGroupDataBridge bridge, String groupId, String deviceId
    ) throws Exception {
        if (!isAuthorizedMember(bridge, groupId, deviceId)) {
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
