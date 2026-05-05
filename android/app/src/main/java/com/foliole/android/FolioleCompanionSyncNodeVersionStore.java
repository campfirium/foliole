package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;

final class FolioleCompanionSyncNodeVersionStore {

    private FolioleCompanionSyncNodeVersionStore() {}

    static JSObject loadNodeVersions(SQLiteDatabase database, JSONObject cursor, int limit, String deviceId) throws Exception {
        JSArray nodes = new JSArray();
        String sql = "SELECT version_id, object_id, parent_version_id, device_id, created_at, content_hash, snapshot_json " +
            "FROM node_sync_versions WHERE device_id = ? " + whereAfterCursor(cursor) +
            " AND object_id NOT LIKE 'conflict-copy-%' " +
            " ORDER BY created_at ASC, version_id ASC LIMIT ?";
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

    static JSObject applyNodeVersions(SQLiteDatabase database, JSONArray nodes, String deviceId) throws Exception {
        JSArray appliedNodeIds = new JSArray();
        if (nodes == null) {
            JSObject result = new JSObject();
            result.put("applied_node_ids", appliedNodeIds);
            return result;
        }
        database.beginTransaction();
        try {
            String now = Instant.now().toString();
            JSONArray branchHeads = FolioleCompanionSyncNodeRecordBatch.latestBranchHeads(nodes);
            for (int index = 0; index < branchHeads.length(); index += 1) {
                JSONObject record = branchHeads.optJSONObject(index);
                if (record == null) {
                    continue;
                }
                JSONObject snapshot = record.optJSONObject("snapshot");
                if (snapshot == null) {
                    continue;
                }
                if (
                    FolioleCompanionSyncConflictCopyIdentity.isConflictCopyNodeId(record.optString("object_id")) ||
                    FolioleCompanionSyncConflictCopyIdentity.isConflictCopyNodeId(snapshot.optString("id"))
                ) {
                    continue;
                }
                String localVersionId = FolioleCompanionSyncNodeVersionApplySupport.loadLocalVersionId(database, record.optString("object_id"));
                if (localVersionId == null) {
                    upsertNode(database, record, snapshot);
                    upsertVersion(database, record, snapshot);
                    appliedNodeIds.put(record.optString("object_id"));
                    continue;
                }
                upsertVersion(database, record, snapshot);
                if (!FolioleCompanionSyncNodeVersionApplySupport.isFastForward(record, localVersionId)) {
                    String copyNodeId = FolioleCompanionSyncConflictCopies.create(database, record, snapshot, deviceId, now);
                    if (copyNodeId != null) {
                        FolioleCompanionSyncNodeVersionApplySupport.recordConflict(database, record, snapshot);
                    }
                    continue;
                }
                if (localVersionId.equals(record.optString("version_id", ""))) {
                    continue;
                }
                upsertNode(database, record, snapshot);
                appliedNodeIds.put(record.optString("object_id"));
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        JSObject result = new JSObject();
        result.put("applied_node_ids", appliedNodeIds);
        return result;
    }

    private static void upsertNode(SQLiteDatabase database, JSONObject record, JSONObject snapshot) {
        String nodeId = snapshot.optString("id", record.optString("object_id"));
        ContentValues values = new ContentValues();
        values.put("id", nodeId);
        putNullableString(values, "parent_id", snapshot.optString("parent_id", null));
        values.put("kind", snapshot.optString("kind", "topic"));
        putNullableInteger(values, "priority", snapshot.opt("priority"));
        putNullableDouble(values, "desired_retention", snapshot.opt("desired_retention"));
        values.put("title", defaultTitle(snapshot.optString("title", "")));
        values.put("is_title_manual", snapshot.optBoolean("is_title_manual", false) ? 1 : 0);
        values.put("hide_title_heading", snapshot.optBoolean("hide_title_heading", false) ? 1 : 0);
        values.put("content", snapshot.optString("content", ""));
        if (snapshot.has("body_blob_hash") && !snapshot.isNull("body_blob_hash")) {
            values.put("body_blob_hash", snapshot.optString("body_blob_hash", null));
        } else {
            values.putNull("body_blob_hash");
        }
        putNullableString(values, "opening_text", snapshot.optString("opening_text", null));
        putJsonValue(values, "virtual_filter", snapshot.opt("virtual_filter"));
        putJsonValue(values, "reveal", snapshot.opt("reveal"));
        putJsonValue(values, "anchor_link", snapshot.opt("anchor_link"));
        putJsonValue(values, "image_regions", snapshot.opt("image_regions"));
        putNullableInteger(values, "position", snapshot.opt("position"));
        putNullableString(values, "current_version_id", record.optString("version_id", null));
        putNullableString(values, "last_modified_by_device_id", record.optString("device_id", null));
        values.put("sync_dirty", 0);
        values.put("created_at", snapshot.optString("created_at", record.optString("updated_at")));
        values.put("updated_at", snapshot.optString("updated_at", record.optString("updated_at")));
        putNullableString(values, "deleted_at", snapshot.optString("deleted_at", null));
        database.insertWithOnConflict("nodes", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        FolioleCompanionNodeAttachmentStore.replaceNodeAttachments(database, nodeId, snapshot.optJSONArray("attachments"));
    }

    private static void upsertVersion(SQLiteDatabase database, JSONObject record, JSONObject snapshot) {
        String versionId = record.optString("version_id", "");
        if (versionId.trim().isEmpty()) {
            return;
        }
        ContentValues values = new ContentValues();
        values.put("version_id", versionId);
        values.put("object_id", record.optString("object_id", snapshot.optString("id")));
        putNullableString(values, "parent_version_id", record.optString("parent_version_id", null));
        values.put("device_id", record.optString("device_id", ""));
        values.put("created_at", record.optString("version_created_at", record.optString("updated_at")));
        values.put("content_hash", record.optString("content_hash", ""));
        values.put("snapshot_json", snapshot.toString());
        database.insertWithOnConflict("node_sync_versions", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static String defaultTitle(String title) {
        String trimmed = title == null ? "" : title.trim();
        return trimmed.isEmpty() ? "Untitled" : trimmed;
    }

    private static void putJsonValue(ContentValues values, String key, Object rawValue) {
        if (rawValue == null || rawValue == JSONObject.NULL) values.putNull(key);
        else values.put(key, rawValue.toString());
    }

    private static void putNullableString(ContentValues values, String key, String value) {
        if (value == null || value.equals("null") || value.trim().isEmpty()) values.putNull(key);
        else values.put(key, value);
    }

    private static void putNullableInteger(ContentValues values, String key, Object rawValue) {
        if (rawValue instanceof Number) values.put(key, ((Number) rawValue).intValue());
        else values.putNull(key);
    }

    private static void putNullableDouble(ContentValues values, String key, Object rawValue) {
        if (rawValue instanceof Number) values.put(key, ((Number) rawValue).doubleValue());
        else values.putNull(key);
    }

    private static String whereAfterCursor(JSONObject cursor) {
        return cursor == null || cursor.optString("created_at").isEmpty() || cursor.optString("change_id").isEmpty()
            ? ""
            : "AND (created_at > ? OR (created_at = ? AND version_id > ?))";
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
