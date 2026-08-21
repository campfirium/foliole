package com.foliole.android;

import android.content.Context;
import android.app.Activity;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import org.json.JSONObject;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

final class FolioleCompanionSyncGroupProvider {
    private static FolioleCompanionNsdAdvertisement advertisement;
    private static Context activeContext;
    private static JSONObject activeConfig;
    private static Object activeOwner;
    private static FolioleCompanionSyncGroupDataBridge dataBridge;
    private static FolioleCompanionSyncGroupServer server;
    private static final Map<String, FolioleCompanionSyncGroupJoinRequest> joinRequests =
        new ConcurrentHashMap<>();

    private FolioleCompanionSyncGroupProvider() {}

    static synchronized JSObject start(
        Context context, Activity activity, PluginCall call, Object owner,
        FolioleCompanionSyncGroupDataBridge.Dispatcher dispatcher,
        boolean participating
    ) throws Exception {
        JSONObject group = call.getData().getJSONObject(key(context, "group"));
        FolioleCompanionCurrentGroupCredential credential =
            FolioleCompanionCurrentGroupCredential.load(context, group.getString("group_id"));
        String authorizationId = value(context, call, "authorizationId");
        if (!credential.authorizationId.equals(authorizationId)) {
            throw new SecurityException("sync_group_local_authorization_mismatch");
        }
        JSONObject next = new JSONObject()
            .put("app_version", value(context, call, "appVersion"))
            .put("authorization_id", authorizationId)
            .put("host_name", value(context, call, "hostName"))
            .put("host_platform", value(context, call, "hostPlatform"))
            .put("facts_revision", value(context, call, "factsRevision"))
            .put("protocol", FolioleCompanionSyncPackProviderDefinitions.load(context).protocol())
            .put("sync_group", group);
        next.put("group_tag", FolioleCompanionSyncGroupCrypto.groupTag(credential.workgroupKey));
        if (sameProvider(next)) {
            next.put("runtime_instance_id", activeConfig.getString("runtime_instance_id"));
            boolean factsChanged = !next.optString("facts_revision").equals(activeConfig.optString("facts_revision"));
            activeOwner = owner;
            activeContext = context.getApplicationContext(); activeConfig = next;
            requireDataBridge().replaceDispatcher(dispatcher);
            if (!participating) stopRuntime();
            else if (server == null) {
                FolioleCompanionSyncScreenAwake.attach(activity);
                startRuntime();
            }
            else if (factsChanged) restartAdvertisement();
            return state();
        }
        if (activeConfig != null) stopActiveProvider();
        next.put("runtime_instance_id", UUID.randomUUID().toString());
        activeContext = context.getApplicationContext(); activeConfig = next; activeOwner = owner;
        dataBridge = new FolioleCompanionSyncGroupDataBridge(activeContext, dispatcher);
        restoreApprovedJoins();
        if (participating) {
            FolioleCompanionSyncScreenAwake.attach(activity);
            startRuntime();
        }
        return state();
    }

    static synchronized JSObject stop(Object owner) {
        return owner == activeOwner ? stopActiveProvider() : state();
    }

    private static JSObject stopActiveProvider() {
        stopRuntime();
        if (activeContext != null) {
            for (FolioleCompanionSyncGroupJoinRequest request : joinRequests.values()) {
                if ("approved".equals(request.status)) FolioleCompanionSyncGroupPeerStore.remove(activeContext, request.pairRequestId);
            }
            FolioleCompanionSyncGroupJoinGrantStore.clear(activeContext);
        }
        activeContext = null; activeConfig = null; activeOwner = null;
        if (dataBridge != null) dataBridge.close();
        dataBridge = null;
        joinRequests.clear();
        return state();
    }

    static synchronized void pause(Object owner) {
        if (owner != activeOwner) return;
        stopRuntime();
    }

    static synchronized JSObject reconcile(Object owner, Activity activity, boolean participating) throws Exception {
        if (owner != activeOwner) return state();
        if (!participating) stopRuntime();
        else if (server == null && activeContext != null && activeConfig != null) {
            FolioleCompanionSyncScreenAwake.attach(activity);
            startRuntime();
        }
        return state();
    }

    private static void stopRuntime() {
        FolioleCompanionSyncScreenAwake.clear();
        if (advertisement != null) advertisement.stop();
        if (server != null) server.stop();
        advertisement = null; server = null;
    }

    private static void startRuntime() throws Exception {
        server = new FolioleCompanionSyncGroupServer(activeContext, activeConfig, joinRequests, requireDataBridge());
        advertisement = FolioleCompanionNsdAdvertisement.start(activeContext, server.port(), activeConfig);
    }

    private static void restartAdvertisement() throws Exception {
        if (advertisement != null) advertisement.stopAndAwait();
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
        return activeConfig.optString("authorization_id").equals(next.optString("authorization_id"))
            && activeConfig.optString("host_name").equals(next.optString("host_name"))
            && currentGroup != null && nextGroup != null
            && currentGroup.optString("group_id").equals(nextGroup.optString("group_id"))
            && currentGroup.optString("timeline_id").equals(nextGroup.optString("timeline_id"));
    }

    static synchronized JSObject approve(Context context, PluginCall call) throws Exception {
        if (server == null) throw new IllegalStateException("sync_participation_inactive");
        FolioleCompanionSyncGroupJoinRequest request = require(call.getString(key(context, "pairRequestId")));
        FolioleCompanionCurrentGroupCredential.load(
            activeContext, activeConfig.getJSONObject("sync_group").getString("group_id")
        );
        request.status = "approved";
        try {
            FolioleCompanionSyncGroupJoinGrantStore.save(activeContext, activeConfig, request);
        } catch (Exception error) {
            request.status = "pending";
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

    static void promoteApprovedJoin(String groupId, String authorizationId) throws Exception {
        FolioleCompanionSyncGroupJoinRequest request = joinRequests.values().stream()
            .filter(item -> authorizationId.equals(item.pairRequestId) && "approved".equals(item.status) && !item.expired())
            .findFirst().orElse(null);
        String hostName = request == null
            ? FolioleCompanionSyncGroupOutboundPeerStore.hostName(activeContext, groupId, authorizationId)
            : request.hostName;
        if (hostName != null && FolioleCompanionSyncGroupDatabase.isAuthorizedMember(
            requireDataBridge(), groupId, hostName)) {
            if (request != null) consumeApprovedJoin(request);
            return;
        }
        if (request == null) throw new SecurityException("sync_group_member_not_authorized");
        String approvedBy = FolioleCompanionSyncGroupJoinGrantStore.approvedByHostName(activeContext, request.pairRequestId);
        request.assign(FolioleCompanionSyncGroupDatabase.registerMember(
            requireDataBridge(), groupId, approvedBy, request
        ));
        consumeApprovedJoin(request);
    }

    static synchronized void assignApprovedProfile(
        Context context,
        FolioleCompanionSyncGroupDataBridge bridge,
        JSONObject config,
        FolioleCompanionSyncGroupJoinRequest request
    ) throws Exception {
        String approvedBy = FolioleCompanionSyncGroupJoinGrantStore.approvedByHostName(context, request.pairRequestId);
        request.assign(FolioleCompanionSyncGroupDatabase.registerMember(
            bridge, config.getJSONObject("sync_group").getString("group_id"), approvedBy, request
        ));
        FolioleCompanionSyncGroupJoinGrantStore.save(context, config, request);
    }

    private static void consumeApprovedJoin(FolioleCompanionSyncGroupJoinRequest request) {
        FolioleCompanionSyncGroupJoinGrantStore.remove(activeContext, request.pairRequestId);
        joinRequests.remove(request.pairRequestId);
    }

    static synchronized void pruneExpired(Context context) {
        joinRequests.entrySet().removeIf((entry) -> {
            FolioleCompanionSyncGroupJoinRequest request = entry.getValue();
            if (!request.expired()) return false;
            if ("approved".equals(request.status)) {
                FolioleCompanionSyncGroupJoinGrantStore.remove(context, request.pairRequestId);
            }
            return true;
        });
    }

    static synchronized JSObject state() {
        return FolioleCompanionSyncGroupProviderState.create(server, advertisement);
    }

    static synchronized String runtimeInstanceId() {
        return activeConfig == null ? "" : activeConfig.optString("runtime_instance_id");
    }

    static synchronized String activeGroupId() {
        JSONObject group = activeConfig == null ? null : activeConfig.optJSONObject("sync_group");
        return group == null ? "" : group.optString("group_id");
    }

    static void resolveDataRequest(JSONObject response) throws Exception {
        requireDataBridge().resolve(response);
    }

    private static FolioleCompanionSyncGroupDataBridge requireDataBridge() {
        if (dataBridge == null) throw new IllegalStateException("sync_group_data_owner_unavailable");
        return dataBridge;
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
