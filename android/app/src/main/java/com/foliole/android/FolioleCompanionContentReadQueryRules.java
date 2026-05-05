package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionContentReadQueryRules {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

    private FolioleCompanionContentReadQueryRules() {}

    static String externalDocumentString(Context context, String key) throws Exception {
        return group(context, "externalDocuments").getString(key);
    }

    static int externalDocumentInt(Context context, String key) throws Exception {
        return group(context, "externalDocuments").getInt(key);
    }

    static String readableArticleString(Context context, String key) throws Exception {
        return group(context, "readableArticle").getString(key);
    }

    static JSONObject readableArticleObject(Context context, String key) throws Exception {
        return group(context, "readableArticle").getJSONObject(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        JSONObject rules = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH)).optJSONObject("contentRead");
        if (rules == null) {
            throw new IllegalStateException("Companion query definitions asset is missing content read rules.");
        }
        JSONObject group = rules.optJSONObject(groupName);
        if (group == null) {
            throw new IllegalStateException("Companion query definitions asset is missing content read rule: " + groupName);
        }
        return group;
    }
}
