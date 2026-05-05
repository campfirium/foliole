package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionMissingResourceQueryRules {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

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
        return Math.max(group(context, "attachmentResources").getInt("minLimit"), limit);
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

    static int contentLimit(Context context, int limit) throws Exception {
        return Math.max(group(context, "contentBlobs").getInt("minLimit"), limit);
    }

    private static String stringValue(Context context, String groupName, String key) throws Exception {
        return group(context, groupName).getString(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        JSONObject rules = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH)).optJSONObject("missingResourceRead");
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
