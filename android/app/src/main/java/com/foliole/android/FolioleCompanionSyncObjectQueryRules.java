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
        empty.put(syncObjectsGroup(context).getString("emptyResultKey"), new JSArray());
        return empty;
    }

    static String syncObjectsQueryName(Context context) throws Exception {
        return queryName(context, "syncObjects");
    }

    static String syncObjectsResultKey(Context context) throws Exception {
        return syncObjectsGroup(context).getString("resultKey");
    }

    static Map<String, String> syncObjectsReplacements(Context context, int idCount, int typeCount) throws Exception {
        JSONObject group = syncObjectsGroup(context);
        Map<String, String> replacements = new HashMap<>();
        replacements.put(group.getString("objectIdsReplacement"), placeholders(idCount));
        replacements.put(
            group.getString("objectTypesReplacement"),
            typeCount > 0 ? placeholders(typeCount) : group.getString("unfilteredObjectTypesReplacement")
        );
        return replacements;
    }

    static String syncStateChangesQueryName(Context context) throws Exception {
        return queryName(context, "syncStateChanges");
    }

    static String syncStateChangesResultKey(Context context) throws Exception {
        return syncStateChangesGroup(context).getString("resultKey");
    }

    static int normalizeCursor(Context context, int cursor) throws Exception {
        return Math.max(syncStateChangesGroup(context).getInt("minCursor"), cursor);
    }

    static int normalizeLimit(Context context, int limit) throws Exception {
        JSONObject group = syncStateChangesGroup(context);
        int defaultLimit = group.getInt("defaultLimit");
        int minLimit = group.getInt("minLimit");
        int maxLimit = group.getInt("maxLimit");
        return Math.max(minLimit, Math.min(maxLimit, limit <= 0 ? defaultLimit : limit));
    }

    private static String queryName(Context context, String groupName) throws Exception {
        return group(context, groupName).getString("queryName");
    }

    private static JSONObject syncObjectsGroup(Context context) throws Exception {
        return group(context, "syncObjects");
    }

    private static JSONObject syncStateChangesGroup(Context context) throws Exception {
        return group(context, "syncStateChanges");
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
