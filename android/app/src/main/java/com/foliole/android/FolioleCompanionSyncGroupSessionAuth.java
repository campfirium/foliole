package com.foliole.android;

import android.content.Context;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONObject;

final class FolioleCompanionSyncGroupSessionAuth {
    private final FolioleCompanionSyncGroupDataBridge bridge;
    private final Context context;
    private final String groupId;
    private final Map<String, String> ready = new ConcurrentHashMap<>();

    FolioleCompanionSyncGroupSessionAuth(
        Context context, String groupId, FolioleCompanionSyncGroupDataBridge bridge
    ) {
        this.context = context;
        this.groupId = groupId;
        this.bridge = bridge;
    }

    String authenticate(FolioleCompanionHttpRequest request) throws Exception {
        String peer = authenticate(request, false);
        String approvedRestore = ready.get(peer);
        if (approvedRestore == null) throw new SecurityException("sync_group_member_state_required");
        JSONObject current = bridge.request("load_member_state", new JSONObject());
        JSONObject restore = current.optJSONObject("restore");
        if (restore != null && !restore.optBoolean("applied", false)) {
            ready.remove(peer);
            throw new SecurityException("sync_group_member_state_required");
        }
        if (!approvedRestore.equals(restoreToken(current))) {
            ready.remove(peer);
            throw new SecurityException("sync_group_member_state_required");
        }
        return peer;
    }

    String authenticate(FolioleCompanionHttpRequest request, boolean allowUnknown)
        throws Exception {
        return FolioleCompanionSyncGroupRequestAuth.authenticate(
            context, request, groupId, bridge, allowUnknown);
    }

    void update(String peer, JSONObject applied) {
        if (applied.optBoolean("normal_sync_ready", false)) {
            ready.put(peer, restoreToken(applied.optJSONObject("state")));
        } else {
            ready.remove(peer);
        }
    }

    private static String restoreToken(JSONObject state) {
        JSONObject restore = state == null ? null : state.optJSONObject("restore");
        JSONObject event = restore == null ? null : restore.optJSONObject("event");
        return event == null ? "" : event.optString("restore_id", "");
    }
}
