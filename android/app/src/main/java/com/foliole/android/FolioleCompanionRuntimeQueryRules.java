package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionRuntimeQueryRules {
    private FolioleCompanionRuntimeQueryRules() {}

    static String stringValue(Context context, String groupName, String key) throws Exception {
        return group(context, groupName).getString(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        JSONObject rules = FolioleCompanionQueryAssetKeys.section(context, "runtimeQueries");
        JSONObject group = rules.optJSONObject(groupName);
        if (group == null) {
            throw new IllegalStateException("Companion query definitions asset is missing runtime query rule: " + groupName);
        }
        return group;
    }
}
