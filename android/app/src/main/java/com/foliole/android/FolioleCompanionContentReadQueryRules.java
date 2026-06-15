package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionContentReadQueryRules {
    private FolioleCompanionContentReadQueryRules() {}

    static String externalDocumentString(Context context, String key) throws Exception {
        return stringValue("externalDocuments", key);
    }

    static int externalDocumentInt(Context context, String key) throws Exception {
        return group(context, "externalDocuments").getInt(key);
    }

    static JSONObject externalDocumentObject(Context context, String key) throws Exception {
        return group(context, "externalDocuments").getJSONObject(key);
    }

    static String externalDocumentOutputKey(Context context, String key) throws Exception {
        return nestedStringValue("externalDocuments", "outputKeys", key);
    }

    static String externalDocumentRowKey(Context context, String key) throws Exception {
        return nestedStringValue("externalDocuments", "rowKeys", key);
    }

    static int externalDocumentRowInt(Context context, JSONObject row, String key) throws Exception {
        return row.getInt(externalDocumentRowKey(context, key));
    }

    static String externalDocumentRowNullableString(Context context, JSONObject row, String key) throws Exception {
        String rowKey = externalDocumentRowKey(context, key);
        return row.isNull(rowKey) ? null : row.optString(rowKey, null);
    }

    static String externalDocumentRowString(Context context, JSONObject row, String key) throws Exception {
        return row.getString(externalDocumentRowKey(context, key));
    }

    static JSONArray externalDocumentArray(Context context, String key) throws Exception {
        return group(context, "externalDocuments").getJSONArray(key);
    }

    static String readableArticleString(Context context, String key) throws Exception {
        return stringValue("readableArticle", key);
    }

    static JSONArray readableArticleArray(Context context, String key) throws Exception {
        return group(context, "readableArticle").getJSONArray(key);
    }

    static JSONObject readableArticleObject(Context context, String key) throws Exception {
        return group(context, "readableArticle").getJSONObject(key);
    }

    static String readableArticleOutputKey(Context context, String key) throws Exception {
        return nestedStringValue("readableArticle", "outputKeys", key);
    }

    static String readableArticleRowKey(Context context, String key) throws Exception {
        return nestedStringValue("readableArticle", "rowKeys", key);
    }

    static String readableArticleRowString(Context context, JSONObject row, String key) throws Exception {
        return row.getString(readableArticleRowKey(context, key));
    }

    static String readableArticleRowNullableString(Context context, JSONObject row, String key) throws Exception {
        String rowKey = readableArticleRowKey(context, key);
        return row.isNull(rowKey) ? null : row.optString(rowKey, null);
    }

    static String topicSearchString(Context context, String key) throws Exception {
        return stringValue("topicSearch", key);
    }

    static int topicSearchInt(Context context, String key) throws Exception {
        return group(context, "topicSearch").getInt(key);
    }

    static String topicSearchOutputKey(Context context, String key) throws Exception {
        return nestedStringValue("topicSearch", "outputKeys", key);
    }

    static JSONArray topicSearchArray(Context context, String key) throws Exception {
        return group(context, "topicSearch").getJSONArray(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionQueryAssetKeys.ruleGroup(context, "contentRead", groupName);
    }

    private static String stringValue(String groupName, String key) {
        return FolioleCompanionResourceQueryStringKeys.string("contentRead", groupName, key);
    }

    private static String nestedStringValue(String groupName, String objectName, String key) {
        return FolioleCompanionResourceQueryStringKeys.nestedString("contentRead", groupName, objectName, key);
    }
}
