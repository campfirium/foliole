package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

final class FolioleCompanionSyncNodeVersionStore {

    private FolioleCompanionSyncNodeVersionStore() {}

    static JSObject loadNodeVersions(Context context, SQLiteDatabase database, JSONObject cursor, int limit, String deviceId) throws Exception {
        JSObject result = FolioleCompanionNamedQueryStore.loadArray(
            context,
            database,
            "syncNodeVersions",
            cursorFilterReplacement(cursor),
            cursorArgs(cursor, deviceId, limit)
        );
        appendAncestorVersionIds(context, database, result.getJSONArray("nodes"));
        return result;
    }

    private static void appendAncestorVersionIds(Context context, SQLiteDatabase database, JSONArray nodes) throws Exception {
        for (int index = 0; index < nodes.length(); index += 1) {
            JSONObject node = nodes.getJSONObject(index);
            node.put("ancestor_version_ids", listAncestorVersionIds(context, database, node.getString("version_id")));
        }
    }

    private static String whereAfterCursor(JSONObject cursor) {
        return cursor == null || cursor.optString("created_at").isEmpty() || cursor.optString("change_id").isEmpty()
            ? ""
            : "AND (v.created_at > ? OR (v.created_at = ? AND v.version_id > ?))";
    }

    private static Map<String, String> cursorFilterReplacement(JSONObject cursor) {
        Map<String, String> replacements = new HashMap<>();
        String filter = whereAfterCursor(cursor);
        replacements.put(":cursorFilter", filter.isEmpty() ? "" : " " + filter);
        return replacements;
    }

    private static String[] cursorArgs(JSONObject cursor, String deviceId, int limit) {
        if (cursor == null || cursor.optString("created_at").isEmpty() || cursor.optString("change_id").isEmpty()) {
            return new String[] { deviceId, String.valueOf(normalizeLimit(limit)) };
        }
        return new String[] {
            deviceId,
            cursor.optString("created_at"),
            cursor.optString("created_at"),
            cursor.optString("change_id"),
            String.valueOf(normalizeLimit(limit))
        };
    }

    private static JSONArray listAncestorVersionIds(Context context, SQLiteDatabase database, String versionId) throws Exception {
        JSONArray ancestors = new JSONArray();
        String cursorVersionId = versionId;
        for (int depth = 0; depth < 1000; depth += 1) {
            String parentVersionId = FolioleCompanionNamedQueryStore.loadString(
                context,
                database,
                "syncNodeVersionParent",
                new String[] { cursorVersionId }
            );
            if (parentVersionId == null || parentVersionId.trim().isEmpty()) {
                break;
            }
            ancestors.put(parentVersionId);
            cursorVersionId = parentVersionId;
        }
        return ancestors;
    }

    private static int normalizeLimit(int limit) {
        return Math.max(1, Math.min(1000, limit <= 0 ? 500 : limit));
    }
}
