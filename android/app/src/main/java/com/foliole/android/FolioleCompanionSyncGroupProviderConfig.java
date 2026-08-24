package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.util.Map;

final class FolioleCompanionSyncGroupProviderConfig {
    private FolioleCompanionSyncGroupProviderConfig() {}

    static void traceConfigured() {
        android.util.Log.d("FolioleSyncProvider", "Provider config ready");
    }

    static void restoreApprovedJoins(
        Context context,
        JSONObject config,
        Map<String, FolioleCompanionSyncGroupJoinRequest> requests
    ) throws Exception {
        JSONObject group = config.getJSONObject("sync_group");
        requests.clear();
        requests.putAll(FolioleCompanionSyncGroupJoinGrantStore.load(
            context, group.getString("group_id"), group.getString("timeline_id")
        ));
        android.util.Log.d("FolioleSyncProvider", "Provider grants restored");
    }

    static boolean sameProvider(JSONObject current, JSONObject next) {
        if (current == null) return false;
        JSONObject currentGroup = current.optJSONObject("sync_group");
        JSONObject nextGroup = next.optJSONObject("sync_group");
        return current.optString("authorization_id").equals(next.optString("authorization_id"))
            && current.optString("host_name").equals(next.optString("host_name"))
            && currentGroup != null && nextGroup != null
            && currentGroup.optString("group_id").equals(nextGroup.optString("group_id"))
            && currentGroup.optString("timeline_id").equals(nextGroup.optString("timeline_id"));
    }
}
