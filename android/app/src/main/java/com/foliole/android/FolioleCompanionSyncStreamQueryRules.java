package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncStreamQueryRules {
    private FolioleCompanionSyncStreamQueryRules() {}

    static String nodeVersionsQueryName(Context context) throws Exception {
        return stringValue(context, "nodeVersions", "queryName");
    }

    static String nodeVersionsResultKey(Context context) throws Exception {
        return stringValue(context, "nodeVersions", "resultKey");
    }

    static String nodeVersionParentQueryName(Context context) throws Exception {
        return stringValue(context, "nodeVersions", "parentQueryName");
    }

    static String nodeVersionIdKey(Context context) throws Exception {
        return stringValue(context, "nodeVersions", "versionIdKey");
    }

    static String nodeVersionAncestorIdsKey(Context context) throws Exception {
        return stringValue(context, "nodeVersions", "ancestorVersionIdsKey");
    }

    static int nodeVersionAncestorDepthLimit(Context context) throws Exception {
        return intValue(context, "nodeVersions", "ancestorDepthLimit");
    }

    static String reviewLogQueryName(Context context) throws Exception {
        return stringValue(context, "reviewLog", "queryName");
    }

    static String[] cursorArgs(Context context, String streamName, JSONObject cursor, String deviceId, int limit) throws Exception {
        String empty = stringValue(context, streamName, "emptyCursorValue");
        String createdAt = cursor == null ? empty : cursor.optString(stringValue(context, streamName, "cursorCreatedAtKey"));
        String changeId = cursor == null ? empty : cursor.optString(stringValue(context, streamName, "cursorChangeIdKey"));
        if (createdAt.isEmpty() || changeId.isEmpty()) {
            return new String[] { deviceId, empty, empty, empty, empty, empty, String.valueOf(normalizeLimit(context, streamName, limit)) };
        }
        return new String[] { deviceId, createdAt, changeId, createdAt, createdAt, changeId, String.valueOf(normalizeLimit(context, streamName, limit)) };
    }

    private static int normalizeLimit(Context context, String streamName, int limit) throws Exception {
        int defaultLimit = intValue(context, streamName, "defaultLimit");
        int minLimit = intValue(context, streamName, "minLimit");
        int maxLimit = intValue(context, streamName, "maxLimit");
        return Math.max(minLimit, Math.min(maxLimit, limit <= 0 ? defaultLimit : limit));
    }

    private static int intValue(Context context, String streamName, String key) throws Exception {
        return group(context, streamName).getInt(key);
    }

    private static String stringValue(Context context, String streamName, String key) throws Exception {
        return group(context, streamName).getString(key);
    }

    private static JSONObject group(Context context, String streamName) throws Exception {
        return FolioleCompanionQueryAssetKeys.ruleGroup(context, "syncStreamRead", streamName);
    }
}
