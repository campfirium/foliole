package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionMutationAssetKeys {
    private static final String MUTATION_ASSET_PATH = "companion-mutation-definitions.json";

    private FolioleCompanionMutationAssetKeys() {}

    static JSONObject section(Context context, String key) throws Exception {
        JSONObject payload = new JSONObject(FolioleCompanionAssetReader.read(context, MUTATION_ASSET_PATH));
        JSONObject section = payload.optJSONObject(key(context, key));
        if (section == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing section: " + key);
        }
        return section;
    }

    static JSONObject ruleGroup(Context context, String sectionKey, String groupName) throws Exception {
        JSONObject rules = section(context, sectionKey);
        JSONObject group = rules.optJSONObject(ruleGroupKey(rules, groupName));
        if (group == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing rule group: " + sectionKey + "." + groupName);
        }
        return group;
    }

    static String key(Context context, String key) throws Exception {
        JSONObject payload = new JSONObject(FolioleCompanionAssetReader.read(context, MUTATION_ASSET_PATH));
        JSONObject assetKeys = payload.optJSONObject("assetKeys");
        if (assetKeys == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing asset keys.");
        }
        return assetKeys.getString(key);
    }

    private static String ruleGroupKey(JSONObject rules, String groupName) throws Exception {
        JSONObject groupKeys = rules.optJSONObject("groupKeys");
        if (groupKeys == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing rule group keys.");
        }
        return groupKeys.getString(groupName);
    }
}
