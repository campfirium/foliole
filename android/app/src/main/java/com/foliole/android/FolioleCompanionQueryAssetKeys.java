package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionQueryAssetKeys {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

    private FolioleCompanionQueryAssetKeys() {}

    static JSONObject section(Context context, String key) throws Exception {
        JSONObject payload = FolioleCompanionJsonAssetCache.object(context, QUERY_ASSET_PATH);
        JSONObject section = payload.optJSONObject(key(context, key));
        if (section == null) {
            throw new IllegalStateException("Companion query definitions asset is missing section: " + key);
        }
        return section;
    }

    static JSONObject ruleGroup(Context context, String sectionKey, String groupName) throws Exception {
        JSONObject rules = section(context, sectionKey);
        JSONObject group = rules.optJSONObject(ruleGroupKey(rules, groupName));
        if (group == null) {
            throw new IllegalStateException("Companion query definitions asset is missing rule group: " + sectionKey + "." + groupName);
        }
        return group;
    }

    static String key(Context context, String key) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.assetKey(key);
    }

    private static String ruleGroupKey(JSONObject rules, String groupName) throws Exception {
        return groupKey(rules, groupName);
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
            throw new IllegalStateException("Companion query definitions asset is missing " + label + ".");
        }
        return object;
    }
}
