package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncDiagnosticQueryRules {
    private FolioleCompanionSyncDiagnosticQueryRules() {}

    static String queryName(Context context, String key) throws Exception {
        return group(context, key).getString("queryName");
    }

    static String resultKey(Context context, String key) throws Exception {
        return group(context, key).getString("resultKey");
    }

    static JSONObject object(Context context, String groupKey, String key) throws Exception {
        return group(context, groupKey).getJSONObject(key);
    }

    static JSONObject object(Context context, String key) throws Exception {
        return group(context, key);
    }

    static JSONArray array(Context context, String groupKey, String key) throws Exception {
        return group(context, groupKey).getJSONArray(key);
    }

    static JSONArray array(Context context, String key) throws Exception {
        return rules(context).getJSONArray(key);
    }

    private static JSONObject group(Context context, String key) throws Exception {
        JSONObject rules = rules(context);
        JSONObject group = rules.optJSONObject(key);
        if (group == null) {
            throw new IllegalStateException("Companion query definitions asset is missing diagnostic read rule: " + key);
        }
        return group;
    }

    private static JSONObject rules(Context context) throws Exception {
        return FolioleCompanionQueryAssetKeys.section(context, "diagnosticRead");
    }
}
