package com.foliole.android;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionSyncGroupProviderState {
    private FolioleCompanionSyncGroupProviderState() {}

    static JSObject create(
        FolioleCompanionSyncGroupServer server,
        FolioleCompanionNsdAdvertisement advertisement
    ) {
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
        result.put("advertisement_error_code", advertisement == null ? JSONObject.NULL : advertisement.errorCode());
        result.put("advertisement_state", advertisement == null ? "stopped" : advertisement.state());
        result.put("port", server == null ? JSONObject.NULL : server.port());
        result.put("state", server == null ? "stopped" : "running");
        return result;
    }
}
