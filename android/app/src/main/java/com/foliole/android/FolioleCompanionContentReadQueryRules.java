package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionContentReadQueryRules {
    private FolioleCompanionContentReadQueryRules() {}

    static String externalDocumentString(Context context, String key) throws Exception {
        return group(context, "externalDocuments").getString(key);
    }

    static int externalDocumentInt(Context context, String key) throws Exception {
        return group(context, "externalDocuments").getInt(key);
    }

    static JSONObject externalDocumentObject(Context context, String key) throws Exception {
        return group(context, "externalDocuments").getJSONObject(key);
    }

    static JSONArray externalDocumentArray(Context context, String key) throws Exception {
        return group(context, "externalDocuments").getJSONArray(key);
    }

    static String readableArticleString(Context context, String key) throws Exception {
        return group(context, "readableArticle").getString(key);
    }

    static JSONObject readableArticleObject(Context context, String key) throws Exception {
        return group(context, "readableArticle").getJSONObject(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionQueryAssetKeys.ruleGroup(context, "contentRead", groupName);
    }
}
