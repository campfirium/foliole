package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncWriteRules {
    private FolioleCompanionSyncWriteRules() {}

    static String recordKey(Context context, String key) throws Exception {
        return group(context, "recordKeys").getString(key);
    }

    static String resultKey(Context context, String key) throws Exception {
        return group(context, "resultKeys").getString(key);
    }

    static String viewCanonicalKey(Context context, String key) throws Exception {
        return group(context, "viewCanonicalKeys").getString(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        JSONObject group = FolioleCompanionSyncProtocolDefinitions.load(context).getJSONObject("syncWrite").optJSONObject(groupName);
        if (group == null) {
            throw new IllegalStateException("Companion sync protocol definitions asset is missing sync write rules: " + groupName);
        }
        return group;
    }
}
