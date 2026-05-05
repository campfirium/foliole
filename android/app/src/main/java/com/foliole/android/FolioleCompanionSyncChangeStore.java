package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.UUID;

final class FolioleCompanionSyncChangeStore {

    private FolioleCompanionSyncChangeStore() {}

    static JSObject loadChanges(SQLiteDatabase database, JSONObject cursor, int limit) throws Exception {
        JSArray changes = new JSArray();
        String sql = "SELECT change_id, object_type, object_id, change_type, device_id, content_hash, payload_json, created_at " +
            "FROM sync_change_log " + whereAfterCursor(cursor) + " ORDER BY created_at ASC, change_id ASC LIMIT ?";
        String[] args = cursor == null
            ? new String[] { String.valueOf(normalizeLimit(limit)) }
            : new String[] { cursor.optString("created_at"), cursor.optString("created_at"), cursor.optString("change_id"), String.valueOf(normalizeLimit(limit)) };
        try (Cursor row = database.rawQuery(sql, args)) {
            while (row.moveToNext()) {
                JSObject change = new JSObject();
                change.put("change_id", row.getString(0));
                change.put("object_type", row.getString(1));
                change.put("object_id", row.getString(2));
                change.put("change_type", row.getString(3));
                change.put("device_id", row.getString(4));
                change.put("content_hash", row.getString(5));
                change.put("payload_json", row.getString(6));
                change.put("created_at", row.getString(7));
                changes.put(change);
            }
        }
        JSObject result = new JSObject();
        result.put("changes", changes);
        return result;
    }

    static JSObject saveSetting(SQLiteDatabase database, JSONObject input, String modifiedByDeviceId) throws Exception {
        String now = Instant.now().toString();
        String key = input.optString("key");
        String scope = input.optString("scope", "device");
        String platform = input.optString("platform", "android");
        String formFactor = input.optString("form_factor", "phone");
        String deviceId = input.optString("device_id", "*");
        String valueJson = input.optString("value_json", "null");
        String objectId = scope + ":" + platform + ":" + formFactor + ":" + deviceId + ":" + key;
        String contentHash = sha256(objectId + "\n" + valueJson);

        database.beginTransaction();
        try {
            upsertSettingRecord(database, key, scope, platform, formFactor, deviceId, valueJson, contentHash, now);
            upsertObjectState(database, objectId, contentHash, modifiedByDeviceId, now);
            insertChange(database, objectId, modifiedByDeviceId, contentHash, buildSettingPayload(key, scope, platform, formFactor, deviceId, valueJson, contentHash, now), now);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        JSObject result = new JSObject();
        result.put("object_id", objectId);
        result.put("content_hash", contentHash);
        return result;
    }

    static JSObject saveNodeReading(SQLiteDatabase database, JSONObject input, String modifiedByDeviceId) throws Exception {
        String nodeId = input.optString("node_id");
        JSONObject payload = new JSONObject(input.optString("reading_json", "{}"));
        String now = Instant.now().toString();
        String contentHash = sha256("node_reading\n" + nodeId + "\n" + payload.toString());
        database.beginTransaction();
        try {
            FolioleCompanionLearningSyncPayload.applyReading(database, nodeId, buildRecord("node_reading", nodeId, payload, contentHash, now));
            upsertTypedObjectState(database, "node_reading", nodeId, contentHash, modifiedByDeviceId, now);
            insertTypedChange(database, "node_reading", nodeId, modifiedByDeviceId, contentHash, payload, now);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        return syncSaveResult(nodeId, contentHash);
    }

    static JSObject saveNodeReview(SQLiteDatabase database, JSONObject input, String modifiedByDeviceId) throws Exception {
        String nodeId = input.optString("node_id");
        JSONObject payload = new JSONObject(input.optString("review_json", "{}"));
        String now = Instant.now().toString();
        String contentHash = sha256("node_review\n" + nodeId + "\n" + payload.toString());
        database.beginTransaction();
        try {
            FolioleCompanionLearningSyncPayload.applyReview(database, nodeId, buildRecord("node_review", nodeId, payload, contentHash, now));
            upsertTypedObjectState(database, "node_review", nodeId, contentHash, modifiedByDeviceId, now);
            insertTypedChange(database, "node_review", nodeId, modifiedByDeviceId, contentHash, payload, now);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        return syncSaveResult(nodeId, contentHash);
    }

    private static String whereAfterCursor(JSONObject cursor) {
        return cursor == null || cursor.optString("created_at").isEmpty() || cursor.optString("change_id").isEmpty()
            ? ""
            : "WHERE created_at > ? OR (created_at = ? AND change_id > ?)";
    }

    private static int normalizeLimit(int limit) {
        return Math.max(1, Math.min(1000, limit <= 0 ? 500 : limit));
    }

    private static void upsertSettingRecord(
        SQLiteDatabase database,
        String key,
        String scope,
        String platform,
        String formFactor,
        String deviceId,
        String valueJson,
        String contentHash,
        String now
    ) {
        ContentValues values = new ContentValues();
        values.put("key", key);
        values.put("scope", scope);
        values.put("platform", platform);
        values.put("form_factor", formFactor);
        values.put("device_id", deviceId);
        values.put("value_json", valueJson);
        values.put("content_hash", contentHash);
        values.put("updated_at", now);
        database.insertWithOnConflict("setting_records", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void upsertObjectState(SQLiteDatabase database, String objectId, String contentHash, String deviceId, String now) {
        upsertTypedObjectState(database, "setting", objectId, contentHash, deviceId, now);
    }

    private static void upsertTypedObjectState(
        SQLiteDatabase database,
        String objectType,
        String objectId,
        String contentHash,
        String deviceId,
        String now
    ) {
        ContentValues values = new ContentValues();
        values.put("object_type", objectType);
        values.put("object_id", objectId);
        values.put("content_hash", contentHash);
        values.put("last_modified_by_device_id", deviceId);
        values.put("updated_at", now);
        values.put("sync_dirty", 1);
        database.insertWithOnConflict("sync_object_state", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void insertChange(SQLiteDatabase database, String objectId, String deviceId, String contentHash, JSONObject payload, String now) {
        insertTypedChange(database, "setting", objectId, deviceId, contentHash, payload, now);
    }

    private static void insertTypedChange(
        SQLiteDatabase database,
        String objectType,
        String objectId,
        String deviceId,
        String contentHash,
        JSONObject payload,
        String now
    ) {
        ContentValues values = new ContentValues();
        values.put("change_id", UUID.randomUUID().toString());
        values.put("object_type", objectType);
        values.put("object_id", objectId);
        values.put("change_type", "upsert");
        values.put("device_id", deviceId);
        values.put("content_hash", contentHash);
        values.put("payload_json", payload.toString());
        values.put("created_at", now);
        values.put("applied_at", now);
        database.insertOrThrow("sync_change_log", null, values);
    }

    private static JSONObject buildRecord(
        String objectType,
        String objectId,
        JSONObject payload,
        String contentHash,
        String now
    ) throws Exception {
        JSONObject record = new JSONObject();
        record.put("object_type", objectType);
        record.put("object_id", objectId);
        record.put("content_hash", contentHash);
        record.put("payload_json", payload.toString());
        record.put("updated_at", now);
        return record;
    }

    private static JSObject syncSaveResult(String objectId, String contentHash) {
        JSObject result = new JSObject();
        result.put("object_id", objectId);
        result.put("content_hash", contentHash);
        return result;
    }

    private static JSONObject buildSettingPayload(
        String key,
        String scope,
        String platform,
        String formFactor,
        String deviceId,
        String valueJson,
        String contentHash,
        String now
    ) throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("key", key);
        payload.put("scope", scope);
        payload.put("platform", platform);
        payload.put("form_factor", formFactor);
        payload.put("device_id", deviceId);
        payload.put("value_json", valueJson);
        payload.put("content_hash", contentHash);
        payload.put("updated_at", now);
        return payload;
    }

    private static String sha256(String text) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
        StringBuilder builder = new StringBuilder();
        for (byte value : digest) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }
}
