package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

@CapacitorPlugin(name = "FolioleSyncGroupJoinPrepare")
public final class FolioleCompanionJoinRequestPlugin extends Plugin {
    private static FolioleCompanionJoinRequestProvider provider;

    interface Action { JSObject run(FolioleCompanionJoinRequestProvider value) throws Exception; }

    static synchronized void installProviderForAcceptance(JSONObject groupInfo) throws Exception {
        provider = new FolioleCompanionJoinRequestProvider(groupInfo);
    }

    static synchronized void clearForRestart() { provider = null; }

    static synchronized FolioleCompanionJoinRequestProvider requireProvider() {
        if (provider == null) throw new IllegalStateException("sync_group_join_provider_unavailable");
        return provider;
    }

    @PluginMethod public void receiveRequest(PluginCall call) {
        run(call, value -> value.receive(requiredObject(call, "request"), System.currentTimeMillis()));
    }

    @PluginMethod public void loadRequests(PluginCall call) {
        run(call, value -> new JSObject().put("requests", value.pending(System.currentTimeMillis())));
    }

    @PluginMethod public void acceptRequest(PluginCall call) {
        run(call, value -> value.accept(requiredString(call, "request_id"), System.currentTimeMillis()));
    }

    @PluginMethod public void collectAcceptance(PluginCall call) {
        run(call, value -> value.collect(requiredString(call, "request_id"), System.currentTimeMillis()));
    }

    @PluginMethod public void rejectRequest(PluginCall call) {
        run(call, value -> new JSObject().put("rejected",
            value.reject(requiredString(call, "request_id"), System.currentTimeMillis())));
    }

    private void run(PluginCall call, Action action) {
        new Thread(() -> {
            try {
                JSObject result = action.run(requireProvider());
                if (result == null) call.resolve(); else call.resolve(result);
            } catch (Exception error) {
                call.reject(FolioleCompanionPluginErrors.withCause(
                    "Sync Group join prepare request failed.", error
                ), error);
            }
        }).start();
    }

    private static JSONObject requiredObject(PluginCall call, String key) {
        JSObject value = call.getObject(key);
        if (value == null) throw new IllegalArgumentException(key + "_required");
        return value;
    }

    private static String requiredString(PluginCall call, String key) {
        String value = call.getString(key, "");
        if (value.isEmpty()) throw new IllegalArgumentException(key + "_required");
        return value;
    }
}
