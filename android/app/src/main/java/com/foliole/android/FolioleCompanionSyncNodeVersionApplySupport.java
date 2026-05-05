package com.foliole.android;

import android.content.ContentValues;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;

final class FolioleCompanionSyncNodeVersionApplySupport {

    private FolioleCompanionSyncNodeVersionApplySupport() {}

    static boolean isFastForward(JSONObject record, String localVersionId) {
        if (localVersionId.isEmpty()) {
            return true;
        }
        if (localVersionId.equals(record.optString("version_id", ""))) {
            return true;
        }
        if (localVersionId.equals(record.optString("parent_version_id", ""))) {
            return true;
        }
        JSONArray ancestors = record.optJSONArray("ancestor_version_ids");
        if (ancestors == null) {
            return false;
        }
        for (int index = 0; index < ancestors.length(); index += 1) {
            if (localVersionId.equals(ancestors.optString(index))) {
                return true;
            }
        }
        return false;
    }

    static void recordConflict(SQLiteDatabase database, JSONObject record, JSONObject snapshot) {
        String versionId = record.optString("version_id", "");
        if (versionId.trim().isEmpty()) {
            return;
        }
        ContentValues values = new ContentValues();
        values.put("conflict_version_id", versionId);
        values.put("object_id", record.optString("object_id", snapshot.optString("id")));
        putNullableString(values, "parent_version_id", record.optString("parent_version_id", null));
        putNullableString(values, "device_id", record.optString("device_id", null));
        putNullableString(values, "content_hash", record.optString("content_hash", null));
        values.put("snapshot_json", snapshot.toString());
        values.put("detected_at", Instant.now().toString());
        database.insertWithOnConflict("node_sync_conflicts", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void putNullableString(ContentValues values, String key, String value) {
        if (value == null || value.equals("null") || value.trim().isEmpty()) values.putNull(key);
        else values.put(key, value);
    }
}
