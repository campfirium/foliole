package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

final class FolioleCompanionSyncGroupDataBridge {
    private static final String LOG_TAG = "FolioleSyncProvider";
    private static FolioleCompanionSyncGroupDataBridge active;
    private final Context context;
    private volatile Dispatcher dispatcher;
    private final Map<String, CompletableFuture<JSONObject>> pending = new ConcurrentHashMap<>();

    FolioleCompanionSyncGroupDataBridge(Context context, Dispatcher dispatcher) {
        this.context = context.getApplicationContext();
        this.dispatcher = dispatcher;
    }

    static synchronized void install(Context context, Dispatcher dispatcher) {
        if (active == null) active = new FolioleCompanionSyncGroupDataBridge(context, dispatcher);
        else active.replaceDispatcher(dispatcher);
    }

    static synchronized FolioleCompanionSyncGroupDataBridge current() {
        if (active == null) throw new IllegalStateException("sync_group_data_owner_unavailable");
        return active;
    }

    static synchronized void uninstall() {
        if (active != null) active.close();
        active = null;
    }

    void replaceDispatcher(Dispatcher dispatcher) {
        this.dispatcher = dispatcher;
    }

    JSONObject request(String operation, JSONObject payload) throws Exception {
        String id = UUID.randomUUID().toString();
        CompletableFuture<JSONObject> future = new CompletableFuture<>();
        pending.put(id, future);
        try {
            JSObject event = new JSObject();
            event.put(requestKey("requestId"), id);
            event.put(requestKey("operation"), operation);
            event.put(requestKey("payload"), payload);
            dispatcher.dispatch(event);
            return future.get(60, TimeUnit.SECONDS);
        } catch (ExecutionException error) {
            Throwable cause = error.getCause();
            if (cause instanceof Exception) throw (Exception) cause;
            throw error;
        } finally {
            pending.remove(id);
        }
    }

    void resolve(JSONObject response) throws Exception {
        String id = response.getString(responseKey("requestId"));
        CompletableFuture<JSONObject> future = pending.get(id);
        if (future == null) throw new IllegalArgumentException("sync_group_data_request_not_found");
        String error = response.optString(responseKey("error"), "");
        if (!error.isEmpty()) future.completeExceptionally(new IllegalStateException(error));
        else future.complete(response.optJSONObject(responseKey("result")) == null
            ? new JSONObject() : response.getJSONObject(responseKey("result")));
    }

    void close() {
        pending.values().forEach((future) -> future.completeExceptionally(
            new IllegalStateException("sync_group_data_owner_stopped")));
        pending.clear();
    }

    private String requestKey(String key) throws Exception {
        return FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderDataRequestKey(context, key);
    }

    private String responseKey(String key) throws Exception {
        return FolioleCompanionHostBridgeContractDefinitions.syncGroupProviderDataResponseKey(context, key);
    }

    interface Dispatcher { void dispatch(JSObject event) throws Exception; }
}
