package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionMissingResourceQueryRules {
    private FolioleCompanionMissingResourceQueryRules() {}

    static String attachmentRowsQueryName(Context context) throws Exception {
        return stringValue(context, "attachmentResources", "rowsQueryName");
    }

    static String attachmentSummaryQueryName(Context context) throws Exception {
        return stringValue(context, "attachmentResources", "summaryQueryName");
    }

    static String attachmentByIdQueryName(Context context) throws Exception {
        return stringValue(context, "attachmentResources", "byIdQueryName");
    }

    static String attachmentResultKey(Context context) throws Exception {
        return stringValue(context, "attachmentResources", "resultKey");
    }

    static String attachmentEmptyResultKey(Context context) throws Exception {
        return stringValue(context, "attachmentResources", "emptyResultKey");
    }

    static int attachmentLimit(Context context, int limit) throws Exception {
        return Math.max(intValue(context, "attachmentResources", "minLimit"), limit);
    }

    static JSONObject attachmentObject(Context context, String key) throws Exception {
        return group(context, "attachmentResources").getJSONObject(key);
    }

    static JSONArray attachmentArray(Context context, String key) throws Exception {
        return group(context, "attachmentResources").getJSONArray(key);
    }

    static String attachmentMimeCategory(Context context, String key) throws Exception {
        return attachmentObject(context, "mimeCategories").getString(key);
    }

    static String attachmentRowKey(Context context, String key) throws Exception {
        return attachmentObject(context, "rowKeys").getString(key);
    }

    static long attachmentRowLong(Context context, JSONObject row, String key) throws Exception {
        return row.getLong(attachmentRowKey(context, key));
    }

    static String attachmentRowNullableString(Context context, JSONObject row, String key) throws Exception {
        String rowKey = attachmentRowKey(context, key);
        return row.isNull(rowKey) ? null : row.optString(rowKey, null);
    }

    static String attachmentRowString(Context context, JSONObject row, String key) throws Exception {
        return row.getString(attachmentRowKey(context, key));
    }

    static long attachmentFieldRowLong(Context context, JSONObject row, JSONObject field) throws Exception {
        return row.getLong(attachmentRowKey(context, FolioleCompanionQueryDefinitionShapeKeys.fieldRowKey(context, field)));
    }

    static String attachmentFieldRowString(Context context, JSONObject row, JSONObject field) throws Exception {
        return row.getString(attachmentRowKey(context, FolioleCompanionQueryDefinitionShapeKeys.fieldRowKey(context, field)));
    }

    static String attachmentSummaryKey(Context context, String key) throws Exception {
        return attachmentObject(context, "summaryKeys").getString(key);
    }

    static String contentHashesQueryName(Context context) throws Exception {
        return stringValue(context, "contentBlobs", "hashesQueryName");
    }

    static String contentSummaryQueryName(Context context) throws Exception {
        return stringValue(context, "contentBlobs", "summaryQueryName");
    }

    static String contentResultKey(Context context) throws Exception {
        return stringValue(context, "contentBlobs", "resultKey");
    }

    static String contentHashesResultKey(Context context) throws Exception {
        return stringValue(context, "contentBlobs", "hashesResultKey");
    }

    static String contentHashKey(Context context) throws Exception {
        return stringValue(context, "contentBlobs", "hashKey");
    }

    static String contentHashString(Context context, JSONObject row) throws Exception {
        return row.getString(contentHashKey(context));
    }

    static int contentLimit(Context context, int limit) throws Exception {
        return Math.max(intValue(context, "contentBlobs", "minLimit"), limit);
    }

    static JSONObject contentObject(Context context, String key) throws Exception {
        return group(context, "contentBlobs").getJSONObject(key);
    }

    static String contentRowKey(Context context, String key) throws Exception {
        return contentObject(context, "rowKeys").getString(key);
    }

    static long contentRowLong(Context context, JSONObject row, String key) throws Exception {
        return row.getLong(contentRowKey(context, key));
    }

    static String contentRowString(Context context, JSONObject row, String key) throws Exception {
        return row.getString(contentRowKey(context, key));
    }

    static String contentSummaryKey(Context context, String key) throws Exception {
        return contentObject(context, "summaryKeys").getString(key);
    }

    private static String stringValue(Context context, String groupName, String key) throws Exception {
        return group(context, groupName).getString(key);
    }

    private static int intValue(Context context, String groupName, String key) throws Exception {
        return group(context, groupName).getInt(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionQueryAssetKeys.ruleGroup(context, "missingResourceRead", groupName);
    }
}
