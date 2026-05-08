package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionMutationAssetKeys {
    private static final String MUTATION_ASSET_PATH = "companion-mutation-definitions.json";

    private FolioleCompanionMutationAssetKeys() {}

    static JSONObject section(Context context, String key) throws Exception {
        JSONObject payload = FolioleCompanionJsonAssetCache.object(context, MUTATION_ASSET_PATH);
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

    static String shapeKey(Context context, String groupName, String key) throws Exception {
        return section(context, "mutationShape").getJSONObject(groupName).getString(key);
    }

    static String appDataClearStatementName(Context context, JSONObject mutation) throws Exception {
        return mutation.getString(appDataClearMutationKey(context, "statementName"));
    }

    static String appDataClearTable(Context context, JSONObject mutation) throws Exception {
        return mutation.getString(appDataClearMutationKey(context, "table"));
    }

    static String key(Context context, String key) throws Exception {
        JSONObject payload = FolioleCompanionJsonAssetCache.object(context, MUTATION_ASSET_PATH);
        return assetKey(payload, key);
    }

    private static String ruleGroupKey(JSONObject rules, String groupName) throws Exception {
        return groupKey(rules, groupName);
    }

    private static String appDataClearMutationKey(Context context, String key) throws Exception {
        return shapeKey(context, "appDataClearMutation", key);
    }

    private static String assetKey(JSONObject payload, String key) throws Exception {
        return object(payload, "assetKeys", "asset keys").getString(key);
    }

    private static String groupKey(JSONObject rules, String key) throws Exception {
        return object(rules, "groupKeys", "rule group keys").getString(key);
    }

    private static JSONObject object(JSONObject source, String key, String label) {
        JSONObject object = source.optJSONObject(key);
        if (object == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing " + label + ".");
        }
        return object;
    }
}
