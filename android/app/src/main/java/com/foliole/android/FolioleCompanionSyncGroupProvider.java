package com.foliole.android;

import android.app.Activity;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.UUID;

final class FolioleCompanionSyncGroupProvider {
    private static FolioleCompanionNsdAdvertisement advertisement;
    private static Context activeContext;
    private static JSONObject activeConfig;
    private static Object activeOwner;
    private static FolioleCompanionSyncGroupDataBridge dataBridge;
    private static FolioleCompanionJoinRequestProvider joinProvider;
    private static FolioleCompanionSyncGroupServer server;
    private static Runnable stateListener = () -> {};

    private FolioleCompanionSyncGroupProvider() {}

    static synchronized JSObject start(
        Context context, Activity activity, PluginCall call, Object owner,
        FolioleCompanionSyncGroupDataBridge.Dispatcher dispatcher,
        Runnable listener, boolean participating
    ) throws Exception {
        JSONObject group = call.getObject(key(context, "group"));
        if (group == null) throw new IllegalArgumentException("sync_group_required");
        FolioleCompanionSyncGroupDataBridge bridge = FolioleCompanionSyncGroupDataBridge.current();
        bridge.replaceDispatcher(dispatcher);
        FolioleCompanionCurrentGroupCredential credential =
            FolioleCompanionCurrentGroupCredential.load(group.getString("group_id"));
        String deviceId = value(context, call, "deviceId");
        if (!credential.deviceId.equals(deviceId)) throw new SecurityException("sync_group_local_device_mismatch");
        JSONObject next = new JSONObject()
            .put("app_version", value(context, call, "appVersion"))
            .put("device_id", deviceId)
            .put("device_name", value(context, call, "deviceName"))
            .put("platform", value(context, call, "platform"))
            .put("facts_revision", value(context, call, "factsRevision"))
            .put("protocol", FolioleCompanionSyncPackProviderDefinitions.load(context).protocol())
            .put("sync_group", group)
            .put("group_tag", FolioleCompanionSyncGroupCrypto.groupTag(credential.workgroupKey));
        boolean same = sameProvider(activeConfig, next);
        next.put("runtime_instance_id", same
            ? activeConfig.getString("runtime_instance_id") : UUID.randomUUID().toString());
        if (!same) stopActiveProvider();
        activeContext = context.getApplicationContext(); activeConfig = next;
        activeOwner = owner; dataBridge = bridge; stateListener = listener;
        if (joinProvider == null) joinProvider = createJoinProvider(group, credential.workgroupKey);
        if (participating && server == null) {
            FolioleCompanionSyncScreenAwake.attach(activity);
            startRuntime();
        } else if (!participating) stopRuntime();
        return state();
    }

    static synchronized JSObject stop(Object owner) {
        return owner == activeOwner ? stopActiveProvider() : state();
    }

    static synchronized void pause(Object owner) {
        if (owner == activeOwner) stopRuntime();
    }

    static synchronized JSObject reconcile(Object owner, Activity activity, boolean participating) throws Exception {
        if (owner != activeOwner) return state();
        if (!participating) stopRuntime();
        else if (server == null && activeConfig != null) {
            FolioleCompanionSyncScreenAwake.attach(activity); startRuntime();
        }
        return state();
    }

    static synchronized JSObject accept(Context context, PluginCall call) throws Exception {
        requireRuntime();
        String requestId = call.getString(key(context, "requestId"));
        FolioleCompanionJoinRequest request = joinProvider.request(requestId, System.currentTimeMillis());
        String groupId = activeConfig.getJSONObject("sync_group").getString("group_id");
        String identityKey = new JSONArray().put(1).put(groupId)
            .put(request.device.getString("device_anchor"))
            .put(request.device.getString("canonical_library_path")).toString();
        JSONObject device = request.registeredDevice(identityKey);
        dataBridge.request("register_device", new JSONObject().put("group_id", groupId).put("device", device));
        JSObject acceptance = joinProvider.accept(requestId, System.currentTimeMillis());
        stateListener.run();
        return acceptance;
    }

    static synchronized JSObject reject(Context context, PluginCall call) throws Exception {
        requireRuntime();
        joinProvider.reject(call.getString(key(context, "requestId")), System.currentTimeMillis());
        stateListener.run();
        return state();
    }

    static synchronized JSObject state() {
        JSObject result = new JSObject();
        try {
            result.put("pending_requests", joinProvider == null ? new JSONArray()
                : joinProvider.pending(System.currentTimeMillis()));
        } catch (Exception error) { result.put("pending_requests", new JSONArray()); }
        result.put("port", server == null ? JSONObject.NULL : server.port());
        result.put("state", server == null ? "stopped" : "running");
        return result;
    }

    static synchronized String runtimeInstanceId() {
        return activeConfig == null ? "" : activeConfig.optString("runtime_instance_id");
    }

    static synchronized String activeGroupId() {
        JSONObject group = activeConfig == null ? null : activeConfig.optJSONObject("sync_group");
        return group == null ? "" : group.optString("group_id");
    }

    private static void startRuntime() throws Exception {
        server = new FolioleCompanionSyncGroupServer(activeContext, activeConfig, joinProvider, dataBridge);
        advertisement = FolioleCompanionNsdAdvertisement.start(activeContext, server.port(), activeConfig);
    }

    private static JSObject stopActiveProvider() {
        stopRuntime();
        activeContext = null; activeConfig = null; activeOwner = null;
        dataBridge = null; joinProvider = null;
        return state();
    }

    private static void stopRuntime() {
        FolioleCompanionSyncScreenAwake.clear();
        if (advertisement != null) advertisement.stop();
        if (server != null) server.stop();
        advertisement = null; server = null;
    }

    private static FolioleCompanionJoinRequestProvider createJoinProvider(JSONObject group, String key) throws Exception {
        return new FolioleCompanionJoinRequestProvider(new JSONObject()
            .put("display_name", group.getString("display_name"))
            .put("group_id", group.getString("group_id"))
            .put("workgroup_key", key));
    }

    private static void requireRuntime() {
        if (server == null || joinProvider == null) throw new IllegalStateException("sync_participation_inactive");
    }

    private static boolean sameProvider(JSONObject left, JSONObject right) {
        if (left == null) return false;
        return left.optString("device_id").equals(right.optString("device_id"))
            && left.optString("facts_revision").equals(right.optString("facts_revision"))
            && left.optJSONObject("sync_group").optString("group_id")
                .equals(right.optJSONObject("sync_group").optString("group_id"));
    }

    private static String value(Context context, PluginCall call, String name) throws Exception {
        String value = call.getString(key(context, name));
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(name + " is required.");
        return value.trim();
    }

    private static String key(Context context, String name) throws Exception {
        return FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderRequestKey(context, name);
    }
}
