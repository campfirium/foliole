package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncPayloadRoutingRules {
    private FolioleCompanionSyncPayloadRoutingRules() {}

    static String string(Context context, String key) throws Exception {
        String value = routing(context).optString(key, "");
        if (value.isEmpty()) {
            throw new IllegalStateException("Companion query definitions asset is missing sync payload routing value: " + key);
        }
        return value;
    }

    private static JSONObject routing(Context context) throws Exception {
        return FolioleCompanionQueryAssetKeys.section(context, "syncPayloadRouting");
    }
}
