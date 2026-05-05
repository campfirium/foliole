package com.foliole.android;

import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class FolioleCompanionSyncObjectQueryRules {
    private FolioleCompanionSyncObjectQueryRules() {}

    static String syncIndexQueryName(Context context) throws Exception {
        return queryName(context, "syncIndex");
    }

    static JSObject emptySyncObjects(Context context) throws Exception {
        JSObject empty = new JSObject();
        empty.put(syncObjectsString(context, "emptyResultKey"), new JSArray());
        return empty;
    }

    static String syncObjectsQueryName(Context context) throws Exception {
        return queryName(context, "syncObjects");
    }

    static String syncObjectsResultKey(Context context) throws Exception {
        return syncObjectsString(context, "resultKey");
    }

    static Map<String, String> syncObjectsReplacements(Context context, int idCount, int typeCount) throws Exception {
        Map<String, String> replacements = new HashMap<>();
        replacements.put(syncObjectsString(context, "objectIdsReplacement"), placeholders(idCount));
        replacements.put(
            syncObjectsString(context, "objectTypesReplacement"),
            typeCount > 0 ? placeholders(typeCount) : syncObjectsString(context, "unfilteredObjectTypesReplacement")
        );
        return replacements;
    }

    static String syncStateChangesQueryName(Context context) throws Exception {
        return queryName(context, "syncStateChanges");
    }

    static String syncStateChangesResultKey(Context context) throws Exception {
        return syncStateChangesString(context, "resultKey");
    }

    static int normalizeCursor(Context context, int cursor) throws Exception {
        return Math.max(syncStateChangesInt(context, "minCursor"), cursor);
    }

    static int normalizeLimit(Context context, int limit) throws Exception {
        int defaultLimit = syncStateChangesInt(context, "defaultLimit");
        int minLimit = syncStateChangesInt(context, "minLimit");
        int maxLimit = syncStateChangesInt(context, "maxLimit");
        return Math.max(minLimit, Math.min(maxLimit, limit <= 0 ? defaultLimit : limit));
    }

    private static String queryName(Context context, String groupName) throws Exception {
        return stringValue(context, groupName, "queryName");
    }

    private static String syncObjectsString(Context context, String key) throws Exception {
        return stringValue(context, "syncObjects", key);
    }

    private static int syncStateChangesInt(Context context, String key) throws Exception {
        return intValue(context, "syncStateChanges", key);
    }

    private static String syncStateChangesString(Context context, String key) throws Exception {
        return stringValue(context, "syncStateChanges", key);
    }

    private static String stringValue(Context context, String groupName, String key) throws Exception {
        return group(context, groupName).getString(key);
    }

    private static int intValue(Context context, String groupName, String key) throws Exception {
        return group(context, groupName).getInt(key);
    }

    private static JSONObject group(Context context, String groupName) throws Exception {
        return FolioleCompanionQueryAssetKeys.ruleGroup(context, "syncObjectRead", groupName);
    }

    private static String placeholders(int count) {
        List<String> placeholders = new ArrayList<>();
        for (int index = 0; index < count; index += 1) placeholders.add("?");
        return String.join(",", placeholders);
    }
}
