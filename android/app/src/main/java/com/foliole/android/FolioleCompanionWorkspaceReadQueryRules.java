package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionWorkspaceReadQueryRules {
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
        return FolioleCompanionQueryAssetKeys.ruleGroup(context, "workspaceRead", groupName);
    }
}
