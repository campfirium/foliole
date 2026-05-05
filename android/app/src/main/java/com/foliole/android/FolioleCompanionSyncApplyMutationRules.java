package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncApplyMutationRules {
    private FolioleCompanionSyncApplyMutationRules() {}

    static String string(Context context, String groupName, String key) throws Exception {
        return group(context, groupName).getString(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionMutationAssetKeys.ruleGroup(context, "syncApplyMutations", groupName);
    }
}
