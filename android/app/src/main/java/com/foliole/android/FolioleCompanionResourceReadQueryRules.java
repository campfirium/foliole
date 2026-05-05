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

    static String contentBlobString(Context context, String key) throws Exception {
        return group(context, "contentBlobs").getString(key);
    }

    static JSONObject contentBlobObject(Context context, String key) throws Exception {
        return group(context, "contentBlobs").getJSONObject(key);
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
