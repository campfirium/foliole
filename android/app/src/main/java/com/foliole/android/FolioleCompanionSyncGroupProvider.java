package com.foliole.android;

import android.app.Activity;
import android.content.Context;

import com.foliole.android.framed.FramedSyncPayloadBudget;
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

    static final class Startup {
        private final Object owner;
        private record PendingStart(JSObject configuration, FramedSyncPayloadBudget document) {}
        private PendingStart pending;

        Startup(Object owner) { this.owner = owner; }

        FolioleCompanionSyncAsync.Work begin(Context context, Activity activity, JSObject configuration,
            FramedSyncPayloadBudget document, Runnable listener, Participation participation) {
            synchronized (FolioleCompanionSyncGroupDataBridge.class) {
                var request = FolioleCompanionSyncGroupDataBridge.beginProviderStart(owner, document);
                pending = request == null ? null : new PendingStart(configuration, document);
                return () -> {
                    try { return start(context, activity, configuration, owner, request, listener, participation); }
                    finally {
                        synchronized (FolioleCompanionSyncGroupDataBridge.class) {
                            if (FolioleCompanionSyncGroupDataBridge.isProviderStartCurrent(request)) pending = null;
                        }
                    }
                };
            }
        }

        FolioleCompanionSyncAsync.Work resume(Context context, Activity activity, FramedSyncPayloadBudget document,
            Runnable listener, Participation participation) {
            synchronized (FolioleCompanionSyncGroupDataBridge.class) {
                if (pending == null) return null;
                if (pending.document() != document || (document != null && document.isClosed())) {
                    cancel();
                    return null;
                }
                return begin(context, activity, pending.configuration(), document, listener, participation);
            }
        }

        void suspend() { FolioleCompanionSyncGroupDataBridge.invalidateProviderStart(owner); }

        void cancel() {
            synchronized (FolioleCompanionSyncGroupDataBridge.class) {
                pending = null;
                suspend();
            }
        }
    }

    interface Participation { boolean active() throws Exception; }

    static JSObject start(Context context, Activity activity, JSObject input, Object owner,
        FolioleCompanionSyncGroupDataBridge.ProviderStart request, Runnable listener,
        Participation participation) throws Exception {
        if (!FolioleCompanionSyncGroupDataBridge.isProviderStartCurrent(request)) return state();
        JSONObject group = input.optJSONObject(key(context, "group"));
        if (group == null) throw new IllegalArgumentException("sync_group_required");
        FolioleCompanionCurrentGroupCredential credential;
        try {
            credential = FolioleCompanionCurrentGroupCredential.load(
                request.bridge(), group.getString("group_id"), request.document());
        } catch (Exception failure) {
            if (!FolioleCompanionSyncGroupDataBridge.isProviderStartCurrent(request)) return state();
            throw failure;
        }
        String deviceId = value(context, input, "deviceId");
        if (!credential.deviceId.equals(deviceId)) throw new SecurityException("sync_group_local_device_mismatch");
        JSONObject next = new JSONObject()
            .put("app_version", value(context, input, "appVersion"))
            .put("device_id", deviceId)
            .put("device_name", value(context, input, "deviceName"))
            .put("platform", value(context, input, "platform"))
            .put("protocol", FolioleCompanionSyncProtocolDefinitions.currentProtocol(context))
            .put("sync_group", group)
            .put("group_tag", FolioleCompanionSyncGroupCrypto.groupTag(credential.workgroupKey));
        return commitStart(context, activity, owner, request, listener, participation, next, group, credential);
    }

    private static synchronized JSObject commitStart(Context context, Activity activity, Object owner,
        FolioleCompanionSyncGroupDataBridge.ProviderStart request, Runnable listener,
        Participation participation, JSONObject next, JSONObject group,
        FolioleCompanionCurrentGroupCredential credential) throws Exception {
        synchronized (FolioleCompanionSyncGroupDataBridge.class) {
            if (!FolioleCompanionSyncGroupDataBridge.isProviderStartCurrent(request)
                || !participation.active()) return state();
            return installRuntime(context, activity, owner, request.bridge(), listener, next, group, credential);
        }
    }

    private static JSObject installRuntime(Context context, Activity activity, Object owner,
        FolioleCompanionSyncGroupDataBridge bridge, Runnable listener, JSONObject next, JSONObject group,
        FolioleCompanionCurrentGroupCredential credential) throws Exception {
        boolean same = sameProvider(activeConfig, next);
        next.put("runtime_instance_id", same
            ? activeConfig.getString("runtime_instance_id") : UUID.randomUUID().toString());
        if (!same) stopActiveProvider();
        activeContext = context.getApplicationContext(); activeConfig = next;
        activeOwner = owner; dataBridge = bridge; stateListener = listener;
        if (joinProvider == null) joinProvider = createJoinProvider(group, credential.workgroupKey);
        if (server == null) {
            FolioleCompanionSyncScreenAwake.attach(activity);
            startRuntime();
        }
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
        String identityKey = request.deviceIdentityKey();
        JSONObject device = request.registeredDevice(identityKey);
        dataBridge.request("register_device", new JSONObject().put("group_id", groupId).put("device", device));
        joinProvider.accept(requestId, System.currentTimeMillis());
        stateListener.run();
        return state();
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

    static synchronized boolean isDiscoverable() {
        return server != null && advertisement != null
            && "registered".equals(advertisement.state());
    }

    private static void startRuntime() throws Exception {
        server = new FolioleCompanionSyncGroupServer(
            activeContext, activeConfig, joinProvider, dataBridge, stateListener
        );
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
            && left.optJSONObject("sync_group").optString("group_id")
                .equals(right.optJSONObject("sync_group").optString("group_id"));
    }

    private static String value(Context context, JSObject input, String name) throws Exception {
        String value = input.optString(key(context, name), null);
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(name + " is required.");
        return value.trim();
    }

    private static String key(Context context, String name) throws Exception {
        return FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderRequestKey(context, name);
    }
}
