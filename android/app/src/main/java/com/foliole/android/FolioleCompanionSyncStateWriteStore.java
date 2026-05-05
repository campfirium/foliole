package com.foliole.android;

import android.content.Context;
import android.content.ContentValues;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.time.Instant;

final class FolioleCompanionSyncStateWriteStore {

    private FolioleCompanionSyncStateWriteStore() {}

    static JSObject saveSetting(Context context, SQLiteDatabase database, JSONObject input, String modifiedByDeviceId) throws Exception {
        String now = Instant.now().toString();
        String key = input.optString("key");
        String scope = input.optString("scope", "device");
        String platform = input.optString("platform", "android");
        String formFactor = input.optString("form_factor", "phone");
        String deviceId = input.optString("device_id", "*");
        String valueJson = input.optString("value_json", "null");
        String objectId = scope + ":" + platform + ":" + formFactor + ":" + deviceId + ":" + key;
        JSONObject payload = new JSONObject();
        payload.put("device_id", deviceId);
        payload.put("form_factor", formFactor);
        payload.put("key", key);
        payload.put("platform", platform);
        payload.put("scope", scope);
        payload.put("value_json", valueJson);
        String contentHash = FolioleCompanionSyncContentHash.hash(payload);

        database.beginTransaction();
        try {
            upsertSettingRecord(database, key, scope, platform, formFactor, deviceId, valueJson, contentHash, now);
            upsertObjectState(context, database, objectId, contentHash, modifiedByDeviceId, now);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        JSObject result = new JSObject();
        result.put("object_id", objectId);
        result.put("content_hash", contentHash);
        return result;
    }

    static JSObject saveNodeReading(Context context, SQLiteDatabase database, JSONObject input, String modifiedByDeviceId) throws Exception {
        String nodeId = input.optString("node_id");
        JSONObject payload = new JSONObject(input.optString("reading_json", "{}"));
        String now = Instant.now().toString();
        payload.put("node_id", nodeId);
        payload.put("device_id", modifiedByDeviceId);
        JSONObject hashPayload = new JSONObject(payload.toString());
        hashPayload.remove("device_id");
        hashPayload.remove("reading_position");
        String contentHash = FolioleCompanionSyncContentHash.hash(hashPayload);
        database.beginTransaction();
        try {
            FolioleCompanionLearningSyncPayload.applyReading(database, nodeId, buildRecord("node_reading", nodeId, payload, contentHash, now));
            upsertTypedObjectState(context, database, "node_reading", nodeId, contentHash, modifiedByDeviceId, now);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        return syncSaveResult(nodeId, contentHash);
    }

    static JSObject saveNodeReview(Context context, SQLiteDatabase database, JSONObject input, String modifiedByDeviceId) throws Exception {
        String nodeId = input.optString("node_id");
        JSONObject payload = new JSONObject(input.optString("review_json", "{}"));
        JSONObject reviewLog = input.has("review_log_json") && !input.isNull("review_log_json")
            ? new JSONObject(input.optString("review_log_json", "{}"))
            : null;
        String now = Instant.now().toString();
        payload.put("node_id", nodeId);
        String contentHash = FolioleCompanionSyncContentHash.hash(payload);
        String opId = null;
        database.beginTransaction();
        try {
            FolioleCompanionLearningSyncPayload.applyReview(database, nodeId, buildRecord("node_review", nodeId, payload, contentHash, now));
            if (reviewLog != null) {
                opId = FolioleCompanionSyncReviewLogStore.saveLocalReviewLog(database, nodeId, reviewLog, modifiedByDeviceId);
            }
            upsertTypedObjectState(context, database, "node_review", nodeId, contentHash, modifiedByDeviceId, now);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        JSObject result = syncSaveResult(nodeId, contentHash);
        if (opId != null) {
            result.put("op_id", opId);
        }
        return result;
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

    private static void upsertObjectState(Context context, SQLiteDatabase database, String objectId, String contentHash, String deviceId, String now) throws Exception {
        upsertTypedObjectState(context, database, "setting", objectId, contentHash, deviceId, now);
    }

    private static void upsertTypedObjectState(
        Context context,
        SQLiteDatabase database,
        String objectType,
        String objectId,
        String contentHash,
        String deviceId,
        String now
    ) throws Exception {
        FolioleCompanionNamedMutationStore.upsertSyncStateRow(context, database, objectType, objectId, null, contentHash, deviceId, now, null, 1);
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
}
