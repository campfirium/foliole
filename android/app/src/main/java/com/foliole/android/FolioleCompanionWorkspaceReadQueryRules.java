package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionWorkspaceReadQueryRules {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

    private FolioleCompanionWorkspaceReadQueryRules() {}

    static String snapshotString(Context context, String key) throws Exception {
        return group(context, "snapshot").getString(key);
    }

    static JSONObject snapshotObject(Context context, String key) throws Exception {
        return group(context, "snapshot").getJSONObject(key);
    }

    static String viewStateString(Context context, String key) throws Exception {
        return group(context, "viewState").getString(key);
    }

    static JSONArray viewStateArray(Context context, String key) throws Exception {
        return group(context, "viewState").getJSONArray(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        JSONObject rules = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH)).optJSONObject("workspaceRead");
        if (rules == null) {
            throw new IllegalStateException("Companion query definitions asset is missing workspace read rules.");
        }
        JSONObject group = rules.optJSONObject(groupName);
        if (group == null) {
            throw new IllegalStateException("Companion query definitions asset is missing workspace read rule: " + groupName);
        }
        return group;
    }
}
