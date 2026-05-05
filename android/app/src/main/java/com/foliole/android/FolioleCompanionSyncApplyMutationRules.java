package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncApplyMutationRules {
    private static final String MUTATION_ASSET_PATH = "companion-mutation-definitions.json";

    private FolioleCompanionSyncApplyMutationRules() {}

    static String string(Context context, String groupName, String key) throws Exception {
        return group(context, groupName).getString(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        JSONObject rules = new JSONObject(FolioleCompanionAssetReader.read(context, MUTATION_ASSET_PATH))
            .optJSONObject(FolioleCompanionMutationAssetKeys.key(context, "syncApplyMutations"));
        if (rules == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing sync apply mutation rules.");
        }
        JSONObject group = rules.optJSONObject(groupName);
        if (group == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing sync apply mutation rule: " + groupName);
        }
        return group;
    }
}
