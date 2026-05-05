package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.Log;

import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncObjectApplyHarness {
    private static final String TAG = "FolioleSyncObjects";

    private FolioleCompanionSyncObjectApplyHarness() {}

    static JSObject applySyncObjects(SQLiteDatabase database, JSONArray objects, String deviceId) throws Exception {
        JSArray appliedObjectIds = new JSArray();
        if (objects == null) {
            JSObject result = new JSObject();
            result.put("applied_object_ids", appliedObjectIds);
            return result;
        }
        for (int index = 0; index < objects.length(); index += 1) {
            JSONObject object = objects.optJSONObject(index);
            if (object == null) {
                Log.w(TAG, "Skipped invalid sync object at index " + index);
                continue;
            }
            try {
                String appliedObjectId = applySingleSyncObject(database, object, deviceId);
                if (appliedObjectId != null) {
                    appliedObjectIds.put(appliedObjectId);
                }
            } catch (Exception error) {
                Log.w(TAG, "Skipped sync object " + object.optString("object_type") + ":" + object.optString("object_id"), error);
            }
        }
        JSObject result = new JSObject();
        result.put("applied_object_ids", appliedObjectIds);
        return result;
    }

    private static String applySingleSyncObject(SQLiteDatabase database, JSONObject object, String deviceId) throws Exception {
        validateSyncObjectRecord(object);
        database.beginTransaction();
        try {
            if (!shouldApplyObject(database, object)) {
                database.setTransactionSuccessful();
                return null;
            }
            FolioleCompanionSyncObjectApply.applyPayload(database, object);
            upsertState(database, object, deviceId);
            database.setTransactionSuccessful();
            return object.optString("object_type") + ":" + object.optString("object_id");
        } finally {
            database.endTransaction();
        }
    }

    private static void validateSyncObjectRecord(JSONObject object) throws Exception {
        String objectType = requireString(object, "object_type");
        if (!isStateObjectType(objectType)) {
            throw new IllegalArgumentException("Unsupported sync object type: " + objectType);
        }
        requireString(object, "object_id");
        requireString(object, "content_hash");
        requireString(object, "updated_at");
        Object deletedAt = requireNullableString(object, "deleted_at");
        Object payloadJson = requireNullableString(object, "payload_json");
        if (deletedAt == JSONObject.NULL && payloadJson == JSONObject.NULL) {
            throw new IllegalArgumentException("Invalid sync object payload_json");
        }
    }

    private static String requireString(JSONObject object, String key) throws Exception {
        if (!object.has(key) || object.isNull(key)) {
            throw new IllegalArgumentException("Invalid sync object " + key);
        }
        String value = object.getString(key).trim();
        if (value.isEmpty()) {
            throw new IllegalArgumentException("Invalid sync object " + key);
        }
        return value;
    }

    private static Object requireNullableString(JSONObject object, String key) throws Exception {
        if (!object.has(key)) {
            throw new IllegalArgumentException("Invalid sync object " + key);
        }
        Object value = object.get(key);
        if (value == JSONObject.NULL) {
            return value;
        }
        if (!(value instanceof String) || ((String) value).trim().isEmpty()) {
            throw new IllegalArgumentException("Invalid sync object " + key);
        }
        return value;
    }

    private static boolean isStateObjectType(String type) {
        return type.equals("attachment") ||
            type.equals("external_document") ||
            type.equals("external_folder") ||
            type.equals("import_source") ||
            type.equals("node_reading") ||
            type.equals("node_review") ||
            type.equals("pdf_page_text") ||
            type.equals("setting") ||
            type.equals("view_state");
    }

    private static boolean shouldApplyObject(SQLiteDatabase database, JSONObject object) {
        try (Cursor cursor = database.query(
            "sync_object_state",
            new String[] { "content_hash", "deleted_at", "updated_at" },
            "object_type = ? AND object_id = ?",
            new String[] { object.optString("object_type"), object.optString("object_id") },
            null,
            null,
            null,
            "1"
        )) {
            if (!cursor.moveToFirst()) {
                return true;
            }
            String currentHash = cursor.getString(0);
            String currentDeletedAt = cursor.isNull(1) ? null : cursor.getString(1);
            String nextDeletedAt = nullIfEmpty(object.optString("deleted_at", ""));
            if (currentHash.equals(object.optString("content_hash")) && sameNullableString(currentDeletedAt, nextDeletedAt)) {
                return false;
            }
            return cursor.getString(2).compareTo(object.optString("updated_at")) <= 0;
        }
    }

    private static void upsertState(SQLiteDatabase database, JSONObject record, String deviceId) {
        try {
            FolioleCompanionNamedMutationStore.upsertSyncStateRow(
                InstrumentationRegistry.getInstrumentation().getTargetContext(),
                database,
                record.optString("object_type"),
                record.optString("object_id"),
                nullIfEmpty(record.optString("sync_version_id", "")),
                record.optString("content_hash"),
                deviceId,
                record.optString("updated_at"),
                nullIfEmpty(record.optString("deleted_at", "")),
                0
            );
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to upsert sync state row.", exception);
        }
    }

    private static String nullIfEmpty(String value) {
        return value == null || value.trim().isEmpty() || value.equals("null") ? null : value;
    }

    private static boolean sameNullableString(String left, String right) {
        if (left == null) return right == null;
        return left.equals(right);
    }
}
