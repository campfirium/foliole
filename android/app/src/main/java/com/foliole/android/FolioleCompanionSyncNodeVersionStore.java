package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncNodeVersionStore {

    private FolioleCompanionSyncNodeVersionStore() {}

    static JSObject loadNodeVersions(SQLiteDatabase database, JSONObject cursor, int limit, String deviceId) throws Exception {
        JSArray nodes = new JSArray();
        String sql = "SELECT v.version_id, v.object_id, v.parent_version_id, v.device_id, v.created_at, v.content_hash, v.snapshot_json " +
            "FROM node_sync_versions v INNER JOIN nodes n ON n.id = v.object_id WHERE v.device_id = ? " + whereAfterCursor(cursor) +
            " AND v.object_id NOT LIKE 'conflict-copy-%' AND n.current_version_id = v.version_id AND n.deleted_at IS NULL " +
            " ORDER BY v.created_at ASC, v.version_id ASC LIMIT ?";
        String[] args = cursor == null
            ? new String[] { deviceId, String.valueOf(normalizeLimit(limit)) }
            : new String[] { deviceId, cursor.optString("created_at"), cursor.optString("created_at"), cursor.optString("change_id"), String.valueOf(normalizeLimit(limit)) };
        try (Cursor row = database.rawQuery(sql, args)) {
            while (row.moveToNext()) {
                JSONObject snapshot = new JSONObject(row.isNull(6) ? "{}" : row.getString(6));
                JSObject record = new JSObject();
                record.put("ancestor_version_ids", listAncestorVersionIds(database, row.getString(0)));
                record.put("version_id", row.getString(0));
                record.put("object_id", row.getString(1));
                record.put("object_type", "node");
                record.put("parent_version_id", row.isNull(2) ? JSONObject.NULL : row.getString(2));
                record.put("device_id", row.getString(3));
                record.put("version_created_at", row.getString(4));
                record.put("updated_at", snapshot.optString("updated_at", row.getString(4)));
                record.put("content_hash", row.getString(5));
                record.put("snapshot", snapshot);
                nodes.put(record);
            }
        }
        JSObject result = new JSObject();
        result.put("nodes", nodes);
        return result;
    }

    private static String whereAfterCursor(JSONObject cursor) {
        return cursor == null || cursor.optString("created_at").isEmpty() || cursor.optString("change_id").isEmpty()
            ? ""
            : "AND (v.created_at > ? OR (v.created_at = ? AND v.version_id > ?))";
    }

    private static JSONArray listAncestorVersionIds(SQLiteDatabase database, String versionId) throws Exception {
        JSONArray ancestors = new JSONArray();
        String cursorVersionId = versionId;
        for (int depth = 0; depth < 1000; depth += 1) {
            String parentVersionId = loadParentVersionId(database, cursorVersionId);
            if (parentVersionId == null || parentVersionId.trim().isEmpty()) {
                break;
            }
            ancestors.put(parentVersionId);
            cursorVersionId = parentVersionId;
        }
        return ancestors;
    }

    private static String loadParentVersionId(SQLiteDatabase database, String versionId) {
        try (Cursor cursor = database.query(
            "node_sync_versions",
            new String[] { "parent_version_id" },
            "version_id = ?",
            new String[] { versionId },
            null,
            null,
            null,
            "1"
        )) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            return cursor.isNull(0) ? null : cursor.getString(0);
        }
    }

    private static int normalizeLimit(int limit) {
        return Math.max(1, Math.min(1000, limit <= 0 ? 500 : limit));
    }
}
