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

    static int pdfPageTextInt(Context context, String key) throws Exception {
        return group(context, "pdfPageText").getInt(key);
    }

    static String pdfPageTextString(Context context, String key) throws Exception {
        return group(context, "pdfPageText").getString(key);
    }

    static JSONObject pdfPageTextObject(Context context, String key) throws Exception {
        return group(context, "pdfPageText").getJSONObject(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionQueryAssetKeys.ruleGroup(context, "resourceRead", groupName);
    }
}
