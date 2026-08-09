package com.foliole.android;

import android.content.Context;
import android.app.Activity;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import org.json.JSONObject;

final class FolioleCompanionSyncGroupProvider {
    private static FolioleCompanionNsdAdvertisement advertisement;
    private static Context activeContext;
    private static JSONObject activeConfig;
    private static FolioleCompanionSyncGroupServer server;

    private FolioleCompanionSyncGroupProvider() {}

    static synchronized JSObject start(Context context, Activity activity, PluginCall call) throws Exception {
        JSONObject next = new JSONObject()
            .put("app_version", value(context, call, "appVersion"))
            .put("database_path", value(context, call, "databasePath"))
            .put("device_id", value(context, call, "deviceId"))
            .put("device_name", value(context, call, "deviceName"))
            .put("protocol", FolioleCompanionSyncPackProviderDefinitions.load(context).protocol())
            .put("sync_group", call.getData().getJSONObject(key(context, "group")));
        stop();
        FolioleCompanionSyncScreenAwake.attach(activity);
        activeContext = context.getApplicationContext(); activeConfig = next;
        startRuntime();
        return state();
    }

    static synchronized JSObject stop() {
        FolioleCompanionSyncScreenAwake.clear();
        if (advertisement != null) advertisement.stop();
        if (server != null) server.stop();
        advertisement = null; server = null;
        activeContext = null; activeConfig = null;
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
        server = new FolioleCompanionSyncGroupServer(activeContext, activeConfig);
        advertisement = FolioleCompanionNsdAdvertisement.start(activeContext, server.port(), activeConfig);
    }

    static synchronized JSObject approve(Context context, PluginCall call) throws Exception {
        FolioleCompanionSyncGroupJoinRequest request = require(call.getString(key(context, "pairRequestId")));
        request.status = "approved";
        FolioleCompanionSyncScreenAwake.touch();
        return state();
    }

    static synchronized JSObject reject(Context context, PluginCall call) throws Exception {
        FolioleCompanionSyncGroupJoinRequest request = require(call.getString(key(context, "pairRequestId")));
        request.status = "rejected";
        return state();
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
        FolioleCompanionSyncGroupJoinRequest request = server == null || id == null ? null : server.requests.get(id);
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
