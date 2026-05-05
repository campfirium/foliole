package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

final class FolioleCompanionLearningPayloadRules {
    private FolioleCompanionLearningPayloadRules() {}

    static String nodeId(Context context, JSONObject input, String queryName) throws Exception {
        return input.optString(metadata(context, queryName, "nodeIdPayloadKey"));
    }

    static JSONObject inputPayload(Context context, JSONObject input, String queryName) throws Exception {
        return new JSONObject(input.optString(metadata(context, queryName, "inputPayloadKey"), "{}"));
    }

    static JSONObject reviewLogInput(Context context, JSONObject input) throws Exception {
        String key = metadata(context, FolioleCompanionSyncPayloadQueryStore.nodeReviewPayloadQueryName(), "reviewLogInputPayloadKey");
        return input.has(key) && !input.isNull(key) ? new JSONObject(input.optString(key, "{}")) : null;
    }

    static JSONObject readingHashPayload(Context context, JSONObject payload) throws Exception {
        JSONObject hashPayload = new JSONObject(payload.toString());
        Set<String> ignoredKeys = metadataSet(
            context,
            FolioleCompanionSyncPayloadQueryStore.nodeReadingPayloadQueryName(),
            "hashIgnoredPayloadKeys"
        );
        for (String ignoredKey : ignoredKeys) {
            hashPayload.remove(ignoredKey);
        }
        return hashPayload;
    }

    static String string(Context context, JSONObject payload, String queryName, String keyName, String fallback) throws Exception {
        return payload.optString(metadata(context, queryName, keyName), fallback);
    }

    static boolean isDeleted(Context context, JSONObject record, String queryName) throws Exception {
        return !record.isNull(metadata(context, queryName, "recordDeletedAtKey"));
    }

    static String updatedAt(Context context, JSONObject record, String queryName) throws Exception {
        return record.optString(metadata(context, queryName, "recordUpdatedAtKey"));
    }

    static long longValue(Context context, JSONObject payload, String queryName, String keyName, String defaultName) throws Exception {
        return payload.optLong(metadata(context, queryName, keyName), longDefault(context, queryName, defaultName));
    }

    static int intValue(Context context, JSONObject payload, String queryName, String keyName, String defaultName) throws Exception {
        return payload.optInt(metadata(context, queryName, keyName), intDefault(context, queryName, defaultName));
    }

    static double doubleValue(Context context, JSONObject payload, String queryName, String keyName, String defaultName) throws Exception {
        return payload.optDouble(metadata(context, queryName, keyName), doubleDefault(context, queryName, defaultName));
    }

    static boolean has(Context context, JSONObject payload, String queryName, String keyName) throws Exception {
        return payload.has(metadata(context, queryName, keyName));
    }

    static void put(Context context, JSONObject payload, String queryName, String keyName, Object value) throws Exception {
        payload.put(metadata(context, queryName, keyName), value);
    }

    private static String metadata(Context context, String queryName, String key) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.metadata(context, queryName, key);
    }

    private static Set<String> metadataSet(Context context, String queryName, String key) throws Exception {
        JSONArray values = new JSONArray(metadataArrayText(context, queryName, key));
        Set<String> result = new HashSet<>();
        for (int index = 0; index < values.length(); index += 1) {
            String value = values.getString(index).trim();
            if (!value.isEmpty()) result.add(value);
        }
        return result;
    }

    private static String metadataArrayText(Context context, String queryName, String key) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.metadataArrayText(context, queryName, key);
    }

    private static long longDefault(Context context, String queryName, String key) throws Exception {
        return Long.parseLong(metadata(context, queryName, key));
    }

    private static int intDefault(Context context, String queryName, String key) throws Exception {
        return Integer.parseInt(metadata(context, queryName, key));
    }

    private static double doubleDefault(Context context, String queryName, String key) throws Exception {
        return Double.parseDouble(metadata(context, queryName, key));
    }
}
