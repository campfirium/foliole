package com.foliole.android;

import android.content.ContentValues;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;

final class FolioleCompanionSyncNodeVersionApplyHarness {
    private FolioleCompanionSyncNodeVersionApplyHarness() {}

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
                if (record == null) continue;
                JSONObject snapshot = record.optJSONObject("snapshot");
                if (snapshot == null || isConflictCopy(record, snapshot)) continue;
                FolioleCompanionSyncLocalNodeState localState =
                    FolioleCompanionSyncLocalNodeState.load(database, record.optString("object_id"));
                if (localState == null) {
                    upsertNode(database, record, snapshot);
                    upsertVersion(database, record, snapshot);
                    appliedNodeIds.put(record.optString("object_id"));
                    continue;
                }
                upsertVersion(database, record, snapshot);
                if (localState.blocks(record, snapshot)) continue;
                if (!FolioleCompanionSyncNodeVersionApplySupport.isFastForward(record, localState.currentVersionId)) {
                    String copyNodeId = FolioleCompanionSyncConflictCopies.create(database, record, snapshot, deviceId, now);
                    if (copyNodeId != null) {
                        FolioleCompanionSyncNodeVersionApplySupport.recordConflict(database, record, snapshot);
                    }
                    continue;
                }
                if (localState.currentVersionId.equals(record.optString("version_id", ""))) continue;
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

    private static boolean isConflictCopy(JSONObject record, JSONObject snapshot) {
        return FolioleCompanionSyncConflictCopyIdentity.isConflictCopyNodeId(record.optString("object_id")) ||
            FolioleCompanionSyncConflictCopyIdentity.isConflictCopyNodeId(snapshot.optString("id"));
    }

    private static void upsertNode(SQLiteDatabase database, JSONObject record, JSONObject snapshot) throws Exception {
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
        FolioleCompanionNodeAttachmentStore.replaceNodeAttachments(
            InstrumentationRegistry.getInstrumentation().getTargetContext(),
            database,
            nodeId,
            snapshot.optJSONArray("attachments")
        );
    }

    private static void upsertVersion(SQLiteDatabase database, JSONObject record, JSONObject snapshot) {
        String versionId = record.optString("version_id", "");
        if (versionId.trim().isEmpty()) return;
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
}
