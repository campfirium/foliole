package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionResourceReadQueryRules {
    private FolioleCompanionResourceReadQueryRules() {}

    static int attachmentInt(Context context, String key) throws Exception {
        return group(context, "attachmentResources").getInt(key);
    }

    static String attachmentString(Context context, String key) throws Exception {
        return group(context, "attachmentResources").getString(key);
    }

    static JSONObject attachmentObject(Context context, String key) throws Exception {
        return group(context, "attachmentResources").getJSONObject(key);
    }

    static String attachmentBatchResponseKey(Context context, String key) throws Exception {
        return attachmentObject(context, "batchResponseKeys").getString(key);
    }

    static String attachmentResolveResponseKey(Context context, String key) throws Exception {
        return attachmentObject(context, "resolveResponseKeys").getString(key);
    }

    static String attachmentResolveStatus(Context context, String key) throws Exception {
        return attachmentObject(context, "resolveStatuses").getString(key);
    }

    static String attachmentSyncResponseKey(Context context, String key) throws Exception {
        return attachmentObject(context, "syncResponseKeys").getString(key);
    }

    static String attachmentRowString(Context context, JSONObject row, String key) throws Exception {
        return row.getString(attachmentString(context, key));
    }

    static String contentBlobString(Context context, String key) throws Exception {
        return group(context, "contentBlobs").getString(key);
    }

    static JSONObject contentBlobObject(Context context, String key) throws Exception {
        return group(context, "contentBlobs").getJSONObject(key);
    }

    static String contentBlobBatchResponseKey(Context context, String key) throws Exception {
        return contentBlobObject(context, "batchResponseKeys").getString(key);
    }

    static String contentBlobSyncResponseKey(Context context, String key) throws Exception {
        return contentBlobObject(context, "syncResponseKeys").getString(key);
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
        return group(context, "pdfPageText").getString(key);
    }

    static JSONObject pdfPageTextObject(Context context, String key) throws Exception {
        return group(context, "pdfPageText").getJSONObject(key);
    }

    static String pdfPageTextOutputKey(Context context, String key) throws Exception {
        return pdfPageTextObject(context, "outputKeys").getString(key);
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
}
