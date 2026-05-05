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

    static int intValue(Context context, String key) throws Exception {
        JSONObject routing = routing(context);
        if (!routing.has(key)) {
            throw new IllegalStateException("Companion query definitions asset is missing sync payload routing value: " + key);
        }
        return routing.getInt(key);
    }

    static boolean rowIsNull(Context context, JSONObject row, String key) throws Exception {
        return row.isNull(string(context, key));
    }

    static String rowString(Context context, JSONObject row, String key) throws Exception {
        return row.getString(string(context, key));
    }

    static String routeOptString(Context context, JSONObject route, String key) throws Exception {
        return route.optString(string(context, key), "");
    }

    static String routeOptString(Context context, JSONObject route, String key, String fallbackKey) throws Exception {
        return route.optString(string(context, key), string(context, fallbackKey));
    }

    static String routeString(Context context, JSONObject route, String key) throws Exception {
        return route.getString(string(context, key));
    }

    private static JSONObject routing(Context context) throws Exception {
        return FolioleCompanionQueryAssetKeys.section(context, "syncPayloadRouting");
    }
}
