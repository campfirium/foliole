package com.foliole.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

final class FolioleCompanionSyncTrigger {
    private FolioleCompanionSyncTrigger() {}

    static JSObject begin(PluginCall call) {
        String reason = required(call.getString("reason"), "reason");
        if (!reason.equals("initial") && !reason.equals("automatic") && !reason.equals("manual")) {
            throw new IllegalArgumentException("Unsupported sync reason.");
        }
        return new JSObject()
            .put("reason", reason)
            .put("run_id", required(call.getString("run_id"), "run_id"))
            .put("runtime", "android");
    }

    private static String required(String value, String name) {
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(name + " is required.");
        return value.trim();
    }
}
