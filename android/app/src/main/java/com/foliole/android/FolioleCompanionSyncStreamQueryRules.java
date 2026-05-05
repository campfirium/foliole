package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionSyncStreamQueryRules {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

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
        return group(context, "nodeVersions").getInt("ancestorDepthLimit");
    }

    static String reviewLogQueryName(Context context) throws Exception {
        return stringValue(context, "reviewLog", "queryName");
    }

    static String[] cursorArgs(Context context, String streamName, JSONObject cursor, String deviceId, int limit) throws Exception {
        JSONObject group = group(context, streamName);
        String empty = group.getString("emptyCursorValue");
        String createdAt = cursor == null ? empty : cursor.optString(group.getString("cursorCreatedAtKey"));
        String changeId = cursor == null ? empty : cursor.optString(group.getString("cursorChangeIdKey"));
        if (createdAt.isEmpty() || changeId.isEmpty()) {
            return new String[] { deviceId, empty, empty, empty, empty, empty, String.valueOf(normalizeLimit(group, limit)) };
        }
        return new String[] { deviceId, createdAt, changeId, createdAt, createdAt, changeId, String.valueOf(normalizeLimit(group, limit)) };
    }

    private static int normalizeLimit(JSONObject group, int limit) throws Exception {
        int defaultLimit = group.getInt("defaultLimit");
        int minLimit = group.getInt("minLimit");
        int maxLimit = group.getInt("maxLimit");
        return Math.max(minLimit, Math.min(maxLimit, limit <= 0 ? defaultLimit : limit));
    }

    private static String stringValue(Context context, String streamName, String key) throws Exception {
        return group(context, streamName).getString(key);
    }

    private static JSONObject group(Context context, String streamName) throws Exception {
        JSONObject rules = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH)).optJSONObject("syncStreamRead");
        if (rules == null) {
            throw new IllegalStateException("Companion query definitions asset is missing sync stream read rules.");
        }
        JSONObject group = rules.optJSONObject(streamName);
        if (group == null) {
            throw new IllegalStateException("Companion query definitions asset is missing sync stream read rule: " + streamName);
        }
        return group;
    }
}
