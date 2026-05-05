package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncConflictCopyProjection {

    private static final String INBOX_NODE_ID = "special-inbox";

    private FolioleCompanionSyncConflictCopyProjection() {}

    static void upsert(
        SQLiteDatabase database,
        JSONObject record,
        JSONObject snapshot,
        String deviceId,
        String copyNodeId,
        String sourceVersionId,
        String now
    ) throws Exception {
        ensureInboxNode(database, now);
        String content = snapshot.optString("content", "");
        String title = conflictCopyTitle(snapshot, record.optString("device_id", ""));
        String openingText = openingText(content, snapshot.optString("title", ""));
        String bodyBlobHash = FolioleCompanionTextBodyBlobs.upsert(
            InstrumentationRegistry.getInstrumentation().getTargetContext(),
            database,
            content,
            now
        );
        String localVersionId = FolioleCompanionSyncConflictCopyIdentity.copyVersionId(deviceId, copyNodeId, sourceVersionId);
        JSONObject copySnapshot = copySnapshot(copyNodeId, title, content, openingText, bodyBlobHash, snapshot, now);
        String contentHash = FolioleCompanionSyncContentHash.hash(copySnapshot);
        insertNode(database, copyNodeId, title, content, openingText, bodyBlobHash, snapshot, deviceId, localVersionId, now);
        insertNodeVersion(database, copyNodeId, localVersionId, deviceId, now, contentHash, copySnapshot);
        insertNodeOrder(database, copyNodeId);
        if (tableExists(database, "sync_object_state")) {
            FolioleCompanionNamedMutationStore.upsertSyncStateRow(
                InstrumentationRegistry.getInstrumentation().getTargetContext(),
                database,
                "node",
                copyNodeId,
                localVersionId,
                contentHash,
                deviceId,
                now,
                null,
                0
            );
        }
    }

    private static void ensureInboxNode(SQLiteDatabase database, String now) {
        if (nodeExists(database, INBOX_NODE_ID)) {
            return;
        }
        ContentValues values = new ContentValues();
        values.put("id", INBOX_NODE_ID);
        values.putNull("parent_id");
        values.put("kind", "folder");
        values.put("title", "Inbox");
        values.put("is_title_manual", 1);
        values.put("hide_title_heading", 0);
        values.put("content", "");
        values.put("created_at", now);
        values.put("updated_at", now);
        database.insertWithOnConflict("nodes", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static boolean nodeExists(SQLiteDatabase database, String nodeId) {
        try (Cursor cursor = database.rawQuery("SELECT 1 FROM nodes WHERE id = ? LIMIT 1", new String[] { nodeId })) {
            return cursor.moveToFirst();
        }
    }

    private static String conflictCopyTitle(JSONObject snapshot, String sourceDeviceId) {
        String title = baseConflictCopyTitle(snapshot.optString("title", "Untitled"));
        return title + " (conflict copy - " + conflictCopySourceLabel(sourceDeviceId) + ")";
    }

    private static String baseConflictCopyTitle(String title) {
        String baseTitle = title == null ? "" : title.trim();
        if (baseTitle.isEmpty()) {
            baseTitle = "Untitled";
        }
        String stripped = baseTitle.replaceAll("(?iu)(?:\\s+\\(conflict copy - [^)]+\\))+$", "").trim();
        return stripped.isEmpty() ? "Untitled" : stripped;
    }

    private static String conflictCopySourceLabel(String sourceDeviceId) {
        String source = sourceDeviceId == null ? "" : sourceDeviceId.trim().toLowerCase();
        if (source.startsWith("android") || "phone".equals(source)) {
            return "Android";
        }
        if (source.startsWith("desktop") || "windows".equals(source)) {
            return "Desktop";
        }
        return "Remote";
    }

    private static String openingText(String content, String fallbackTitle) {
        String trimmed = content == null ? "" : content.replaceAll("\\s+", " ").trim();
        if (!trimmed.isEmpty()) {
            return trimmed.length() > 240 ? trimmed.substring(0, 240) : trimmed;
        }
        String title = fallbackTitle == null ? "" : fallbackTitle.trim();
        return title.isEmpty() ? null : title;
    }

    private static JSONObject copySnapshot(
        String copyNodeId,
        String title,
        String content,
        String openingText,
        String bodyBlobHash,
        JSONObject source,
        String now
    ) throws Exception {
        JSONObject snapshot = new JSONObject();
        snapshot.put("anchor_link", JSONObject.NULL);
        snapshot.put("attachments", new JSONArray());
        snapshot.put("body_blob_hash", bodyBlobHash == null ? JSONObject.NULL : bodyBlobHash);
        snapshot.put("content", content);
        snapshot.put("created_at", now);
        snapshot.put("deleted_at", JSONObject.NULL);
        snapshot.put("desired_retention", JSONObject.NULL);
        snapshot.put("hide_title_heading", source.optBoolean("hide_title_heading", false));
        snapshot.put("id", copyNodeId);
        snapshot.put("image_regions", JSONObject.NULL);
        snapshot.put("is_title_manual", true);
        snapshot.put("kind", "topic");
        snapshot.put("opening_text", openingText == null ? JSONObject.NULL : openingText);
        snapshot.put("parent_id", INBOX_NODE_ID);
        snapshot.put("position", JSONObject.NULL);
        snapshot.put("priority", JSONObject.NULL);
        snapshot.put("reveal", JSONObject.NULL);
        snapshot.put("title", title);
        snapshot.put("updated_at", now);
        snapshot.put("virtual_filter", JSONObject.NULL);
        return snapshot;
    }

    private static void insertNode(
        SQLiteDatabase database,
        String copyNodeId,
        String title,
        String content,
        String openingText,
        String bodyBlobHash,
        JSONObject source,
        String deviceId,
        String versionId,
        String now
    ) {
        ContentValues values = new ContentValues();
        values.put("id", copyNodeId);
        values.put("parent_id", INBOX_NODE_ID);
        values.put("kind", "topic");
        values.put("title", title);
        values.put("is_title_manual", 1);
        values.put("hide_title_heading", source.optBoolean("hide_title_heading", false) ? 1 : 0);
        values.put("content", content);
        if (bodyBlobHash == null) values.putNull("body_blob_hash");
        else values.put("body_blob_hash", bodyBlobHash);
        if (openingText == null) values.putNull("opening_text");
        else values.put("opening_text", openingText);
        values.put("current_version_id", versionId);
        values.put("last_modified_by_device_id", deviceId);
        values.put("sync_dirty", 0);
        values.put("created_at", now);
        values.put("updated_at", now);
        database.insertWithOnConflict("nodes", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void insertNodeVersion(
        SQLiteDatabase database,
        String copyNodeId,
        String versionId,
        String deviceId,
        String now,
        String contentHash,
        JSONObject snapshot
    ) {
        ContentValues values = new ContentValues();
        values.put("version_id", versionId);
        values.put("object_id", copyNodeId);
        values.putNull("parent_version_id");
        values.put("device_id", deviceId);
        values.put("created_at", now);
        values.put("content_hash", contentHash);
        values.put("snapshot_json", snapshot.toString());
        database.insertWithOnConflict("node_sync_versions", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void insertNodeOrder(SQLiteDatabase database, String copyNodeId) {
        if (!tableExists(database, "node_order")) {
            return;
        }
        ContentValues values = new ContentValues();
        values.put("node_id", copyNodeId);
        values.put("position", inboxTopPosition(database));
        database.insertWithOnConflict("node_order", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static int inboxTopPosition(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery(
            "SELECT MIN(o.position) FROM nodes n JOIN node_order o ON o.node_id = n.id WHERE n.parent_id = ?",
            new String[] { INBOX_NODE_ID }
        )) {
            if (cursor.moveToFirst() && !cursor.isNull(0)) {
                return cursor.getInt(0) - 1;
            }
        }
        try (Cursor cursor = database.rawQuery("SELECT MAX(position) FROM node_order", null)) {
            return cursor.moveToFirst() && !cursor.isNull(0) ? cursor.getInt(0) + 1 : 0;
        }
    }

    private static boolean tableExists(SQLiteDatabase database, String tableName) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            new String[] { tableName }
        )) {
            return cursor.moveToFirst();
        }
    }
}
