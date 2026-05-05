package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionResourceReadQueryRules {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

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
        JSONObject rules = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH)).optJSONObject("resourceRead");
        if (rules == null) {
            throw new IllegalStateException("Companion query definitions asset is missing resource read rules.");
        }
        JSONObject group = rules.optJSONObject(groupName);
        if (group == null) {
            throw new IllegalStateException("Companion query definitions asset is missing resource read rule: " + groupName);
        }
        return group;
    }
}
