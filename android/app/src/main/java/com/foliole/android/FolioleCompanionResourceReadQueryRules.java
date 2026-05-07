package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionResourceReadQueryRules {
    private FolioleCompanionResourceReadQueryRules() {}

    static int attachmentInt(Context context, String key) throws Exception {
        return group(context, "attachmentResources").getInt(key);
    }

    static String attachmentString(Context context, String key) throws Exception {
        return stringValue("attachmentResources", key);
    }

    static JSONObject attachmentObject(Context context, String key) throws Exception {
        return group(context, "attachmentResources").getJSONObject(key);
    }

    static String attachmentBatchResponseKey(Context context, String key) throws Exception {
        return nestedStringValue("attachmentResources", "batchResponseKeys", key);
    }

    static String attachmentResolveResponseKey(Context context, String key) throws Exception {
        return nestedStringValue("attachmentResources", "resolveResponseKeys", key);
    }

    static String attachmentResolveStatus(Context context, String key) throws Exception {
        return nestedStringValue("attachmentResources", "resolveStatuses", key);
    }

    static String attachmentSyncResponseKey(Context context, String key) throws Exception {
        return nestedStringValue("attachmentResources", "syncResponseKeys", key);
    }

    static String attachmentRowString(Context context, JSONObject row, String key) throws Exception {
        return row.getString(attachmentString(context, key));
    }

    static String contentBlobString(Context context, String key) throws Exception {
        return stringValue("contentBlobs", key);
    }

    static JSONObject contentBlobObject(Context context, String key) throws Exception {
        return group(context, "contentBlobs").getJSONObject(key);
    }

    static String contentBlobCasString(Context context, String key) throws Exception {
        return stringValue("contentBlobCas", key);
    }

    static JSONObject contentBlobCasObject(Context context, String key) throws Exception {
        return group(context, "contentBlobCas").getJSONObject(key);
    }

    static boolean contentBlobCasBoolean(Context context, String key) throws Exception {
        return group(context, "contentBlobCas").getBoolean(key);
    }

    static boolean contentBlobCasBoolean(Context context, String groupKey, String key) throws Exception {
        return contentBlobCasObject(context, groupKey).getBoolean(key);
    }

    static String contentBlobBatchResponseKey(Context context, String key) throws Exception {
        return nestedStringValue("contentBlobs", "batchResponseKeys", key);
    }

    static String contentBlobSyncResponseKey(Context context, String key) throws Exception {
        return nestedStringValue("contentBlobs", "syncResponseKeys", key);
    }

    static long contentBlobRowLong(Context context, JSONObject row, String key) throws Exception {
        return row.getLong(contentBlobString(context, key));
    }

    static String contentBlobRowString(Context context, JSONObject row, String key) throws Exception {
        return row.getString(contentBlobString(context, key));
    }

    static int pdfPageTextInt(Context context, String key) throws Exception {
        return group(context, "pdfPageText").getInt(key);
    }

    static String pdfPageTextString(Context context, String key) throws Exception {
        return stringValue("pdfPageText", key);
    }

    static JSONObject pdfPageTextObject(Context context, String key) throws Exception {
        return group(context, "pdfPageText").getJSONObject(key);
    }

    static JSONArray pdfPageTextArray(Context context, String key) throws Exception {
        return group(context, "pdfPageText").getJSONArray(key);
    }

    static String pdfPageTextOutputKey(Context context, String key) throws Exception {
        return nestedStringValue("pdfPageText", "outputKeys", key);
    }

    static String pdfPageTextRowString(Context context, JSONObject row, String key) throws Exception {
        return row.getString(pdfPageTextString(context, key));
    }

    static int pdfPageTextRowInt(Context context, JSONObject row, String key) throws Exception {
        return row.getInt(pdfPageTextString(context, key));
    }

    static String pdfPageTextRowOptString(Context context, JSONObject row, String key, String defaultValue) throws Exception {
        return row.optString(pdfPageTextString(context, key), defaultValue);
    }

    static int pdfPageTextRowOptInt(Context context, JSONObject row, String key) throws Exception {
        return row.optInt(pdfPageTextString(context, key));
    }

    static Object pdfPageTextRowValue(Context context, JSONObject row, String key) throws Exception {
        return row.opt(pdfPageTextString(context, key));
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionQueryAssetKeys.ruleGroup(context, "resourceRead", groupName);
    }

    private static String stringValue(String groupName, String key) {
        return FolioleCompanionResourceQueryStringKeys.string("resourceRead", groupName, key);
    }

    private static String nestedStringValue(String groupName, String objectName, String key) {
        return FolioleCompanionResourceQueryStringKeys.nestedString("resourceRead", groupName, objectName, key);
    }
}
