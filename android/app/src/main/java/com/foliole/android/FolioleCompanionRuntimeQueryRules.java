package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionRuntimeQueryRules {
    private FolioleCompanionRuntimeQueryRules() {}

    static String stringValue(Context context, String groupName, String key) throws Exception {
        return group(context, groupName).getString(key);
    }

    static int rowInt(Context context, String groupName, JSONObject row, String key) throws Exception {
        return row.getInt(stringValue(context, groupName, key));
    }

    static long rowLong(Context context, String groupName, JSONObject row, String key) throws Exception {
        return row.getLong(stringValue(context, groupName, key));
    }

    static String rowNullableString(Context context, String groupName, JSONObject row, String key) throws Exception {
        String rowKey = stringValue(context, groupName, key);
        return row.isNull(rowKey) ? null : row.getString(rowKey);
    }

    static String rowString(Context context, String groupName, JSONObject row, String key) throws Exception {
        return row.getString(stringValue(context, groupName, key));
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionQueryAssetKeys.ruleGroup(context, "runtimeQueries", groupName);
    }
}
