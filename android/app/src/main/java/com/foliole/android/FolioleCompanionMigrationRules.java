package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionMigrationRules {
    private static final String MIGRATION_SCHEMA_ASSET_PATH = "companion-migration-schema.json";

    private FolioleCompanionMigrationRules() {}

    static String stringValue(Context context, String groupName, String key) throws Exception {
        return group(context, groupName).getString(key);
    }

    static JSONArray stringArray(Context context, String groupName, String key) throws Exception {
        return group(context, groupName).getJSONArray(key);
    }

    static String actionType(Context context, String key) throws Exception {
        return section(context, "actionTypes").getString(key);
    }

    static String rowKey(Context context, String key) throws Exception {
        return group(context, "syncObjectStateSequence").getJSONObject("rowKeys").getString(key);
    }

    private static JSONObject section(Context context, String key) throws Exception {
        JSONObject section = new JSONObject(FolioleCompanionAssetReader.read(context, MIGRATION_SCHEMA_ASSET_PATH)).optJSONObject(key);
        if (section == null) {
            throw new IllegalStateException("Companion migration schema asset is missing section: " + key);
        }
        return section;
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        JSONObject rules = section(context, "repairRules");
        if (rules == null) {
            throw new IllegalStateException("Companion migration schema asset is missing repairRules.");
        }
        JSONObject group = rules.optJSONObject(groupName);
        if (group == null) {
            throw new IllegalStateException("Companion migration schema asset is missing repair rule: " + groupName);
        }
        return group;
    }
}
