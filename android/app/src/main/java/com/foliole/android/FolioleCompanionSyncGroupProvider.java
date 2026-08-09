package com.foliole.android;

import android.content.Context;
import android.app.Activity;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import org.json.JSONObject;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

final class FolioleCompanionSyncGroupProvider {
    private static FolioleCompanionNsdAdvertisement advertisement;
    private static Context activeContext;
    private static JSONObject activeConfig;
    private static FolioleCompanionSyncGroupServer server;
    private static final Map<String, FolioleCompanionSyncGroupJoinRequest> joinRequests =
        new ConcurrentHashMap<>();

    private FolioleCompanionSyncGroupProvider() {}

    static synchronized JSObject start(Context context, Activity activity, PluginCall call) throws Exception {
        JSONObject next = new JSONObject()
            .put("app_version", value(context, call, "appVersion"))
            .put("database_path", value(context, call, "databasePath"))
            .put("device_id", value(context, call, "deviceId"))
            .put("device_name", value(context, call, "deviceName"))
            .put("protocol", FolioleCompanionSyncPackProviderDefinitions.load(context).protocol())
            .put("sync_group", call.getData().getJSONObject(key(context, "group")));
        if (sameProvider(next)) {
            FolioleCompanionSyncScreenAwake.attach(activity);
            activeContext = context.getApplicationContext(); activeConfig = next;
            if (server == null) startRuntime();
            return state();
        }
        if (activeConfig != null) stop();
        FolioleCompanionSyncScreenAwake.attach(activity);
        activeContext = context.getApplicationContext(); activeConfig = next;
        restoreApprovedJoins();
        startRuntime();
        return state();
    }

    static synchronized JSObject stop() {
        FolioleCompanionSyncScreenAwake.clear();
        if (advertisement != null) advertisement.stop();
        if (server != null) server.stop();
        advertisement = null; server = null;
        if (activeContext != null) {
            for (FolioleCompanionSyncGroupJoinRequest request : joinRequests.values()) {
                if ("approved".equals(request.status)) FolioleCompanionSyncGroupPeerStore.remove(activeContext, request.deviceId);
            }
            FolioleCompanionSyncGroupJoinGrantStore.clear(activeContext);
        }
        activeContext = null; activeConfig = null;
        joinRequests.clear();
        return state();
    }

    static synchronized void pause() {
        FolioleCompanionSyncScreenAwake.clear();
        if (advertisement != null) advertisement.stop();
        if (server != null) server.stop();
        advertisement = null; server = null;
    }

    static synchronized void resume() throws Exception {
        if (server == null && activeContext != null && activeConfig != null) startRuntime();
    }

    private static void startRuntime() throws Exception {
        server = new FolioleCompanionSyncGroupServer(activeContext, activeConfig, joinRequests);
        advertisement = FolioleCompanionNsdAdvertisement.start(activeContext, server.port(), activeConfig);
    }

    private static void restoreApprovedJoins() throws Exception {
        JSONObject group = activeConfig.getJSONObject("sync_group");
        joinRequests.clear();
        joinRequests.putAll(FolioleCompanionSyncGroupJoinGrantStore.load(
            activeContext, group.getString("group_id"), group.getString("timeline_id")
        ));
    }

    private static boolean sameProvider(JSONObject next) {
        if (activeConfig == null) return false;
        JSONObject currentGroup = activeConfig.optJSONObject("sync_group");
        JSONObject nextGroup = next.optJSONObject("sync_group");
        return activeConfig.optString("database_path").equals(next.optString("database_path"))
            && activeConfig.optString("device_id").equals(next.optString("device_id"))
            && currentGroup != null && nextGroup != null
            && currentGroup.optString("group_id").equals(nextGroup.optString("group_id"))
            && currentGroup.optString("timeline_id").equals(nextGroup.optString("timeline_id"));
    }

    static synchronized JSObject approve(Context context, PluginCall call) throws Exception {
        FolioleCompanionSyncGroupJoinRequest request = require(call.getString(key(context, "pairRequestId")));
        request.deviceSecret = FolioleCompanionSyncGroupPeerStore.createSecret(activeContext, request.deviceId);
        request.providerSecret = FolioleCompanionSyncGroupPeerStore.randomSecret();
        request.status = "approved";
        try {
            FolioleCompanionSyncGroupJoinGrantStore.save(activeContext, activeConfig, request);
        } catch (Exception error) {
            request.status = "pending";
            FolioleCompanionSyncGroupPeerStore.remove(activeContext, request.deviceId);
            throw error;
        }
        FolioleCompanionSyncScreenAwake.touch();
        return state();
    }

    static synchronized JSObject reject(Context context, PluginCall call) throws Exception {
        FolioleCompanionSyncGroupJoinRequest request = require(call.getString(key(context, "pairRequestId")));
        request.status = "rejected";
        return state();
    }

    static synchronized void promoteApprovedJoin(String groupId, String databasePath, String deviceId) throws Exception {
        if (FolioleCompanionSyncGroupDatabase.isAuthorizedMember(databasePath, groupId, deviceId)) return;
        FolioleCompanionSyncGroupJoinRequest request = joinRequests.values().stream()
            .filter(item -> deviceId.equals(item.deviceId) && "approved".equals(item.status) && !item.expired())
            .findFirst().orElseThrow(() -> new SecurityException("sync_group_member_not_authorized"));
        String approvedBy = FolioleCompanionSyncGroupJoinGrantStore.approvedByDeviceId(activeContext, request.pairRequestId);
        FolioleCompanionSyncGroupDatabase.registerMember(databasePath, groupId, approvedBy, request);
        FolioleCompanionSyncGroupJoinGrantStore.remove(activeContext, request.pairRequestId);
        joinRequests.remove(request.pairRequestId);
    }

    static synchronized void pruneExpired(Context context) {
        joinRequests.entrySet().removeIf((entry) -> {
            FolioleCompanionSyncGroupJoinRequest request = entry.getValue();
            if (!request.expired()) return false;
            if ("approved".equals(request.status)) {
                FolioleCompanionSyncGroupJoinGrantStore.remove(context, request.pairRequestId);
                FolioleCompanionSyncGroupPeerStore.remove(context, request.deviceId);
            }
            return true;
        });
    }

    static synchronized JSObject state() {
        JSArray pending = new JSArray();
        if (server != null) {
            for (FolioleCompanionSyncGroupJoinRequest request : server.requests.values()) {
                if (request.status.equals("pending")) {
                    try { pending.put(request.publicJson()); } catch (Exception ignored) {}
                }
            }
        }
        JSObject result = new JSObject();
        result.put("pending_requests", pending);
        result.put("port", server == null ? JSONObject.NULL : server.port());
        result.put("state", server == null ? "stopped" : "running");
        return result;
    }

    private static FolioleCompanionSyncGroupJoinRequest require(String id) {
        FolioleCompanionSyncGroupJoinRequest request = id == null ? null : joinRequests.get(id);
        if (request == null) throw new IllegalArgumentException("pair_request_not_found");
        return request;
    }

    private static String value(Context context, PluginCall call, String name) throws Exception {
        String key = key(context, name);
        String value = call.getString(key);
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(key + " is required.");
        return value.trim();
    }

    private static String key(Context context, String name) throws Exception {
        return FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderRequestKey(context, name);
    }
}
