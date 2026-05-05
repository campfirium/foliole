package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionRuntimeQueryRules {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

    private FolioleCompanionRuntimeQueryRules() {}

    static String stringValue(Context context, String groupName, String key) throws Exception {
        return group(context, groupName).getString(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        JSONObject rules = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH)).optJSONObject("runtimeQueries");
        if (rules == null) {
            throw new IllegalStateException("Companion query definitions asset is missing runtime query rules.");
        }
        JSONObject group = rules.optJSONObject(groupName);
        if (group == null) {
            throw new IllegalStateException("Companion query definitions asset is missing runtime query rule: " + groupName);
        }
        return group;
    }
}
