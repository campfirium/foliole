package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.time.Instant;
import java.util.UUID;

final class FolioleCompanionMetaRecords {

    private static final String META_TABLE = "companion_meta";
    private static final String DEVICE_ID_KEY = "device_id";

    private FolioleCompanionMetaRecords() {}

    static String loadOrCreateDeviceId(SQLiteDatabase database, String now) {
        String deviceId = loadValue(database, DEVICE_ID_KEY);
        if (deviceId != null) {
            return deviceId;
        }
        String nextDeviceId = "android-" + UUID.randomUUID();
        saveValue(database, DEVICE_ID_KEY, nextDeviceId, now);
        return nextDeviceId;
    }

    static JSObject loadNumberCursor(SQLiteDatabase database, String key) throws Exception {
        JSObject result = new JSObject();
        int cursor = loadNumberCursorValue(database, key);
        result.put("cursor", cursor <= 0 ? JSONObject.NULL : cursor);
        return result;
    }

    static JSObject saveNumberCursor(SQLiteDatabase database, String key, Integer cursor) throws Exception {
        saveNumberCursorValue(database, key, cursor == null ? 0 : cursor);
        return loadNumberCursor(database, key);
    }

    static int loadNumberCursorValue(SQLiteDatabase database, String key) {
        String stored = loadValue(database, key);
        return stored == null ? 0 : Math.max(0, Integer.parseInt(stored));
    }

    static void saveNumberCursorValue(SQLiteDatabase database, String key, int cursor) {
        if (cursor <= 0) {
            deleteValue(database, key);
        } else {
            saveValue(database, key, String.valueOf(cursor), Instant.now().toString());
        }
    }

    static JSObject loadJsonCursor(SQLiteDatabase database, String key) throws Exception {
        JSObject result = new JSObject();
        String stored = loadValue(database, key);
        result.put("cursor", stored == null ? JSONObject.NULL : new JSONObject(stored));
        return result;
    }

    static JSObject saveJsonCursor(SQLiteDatabase database, String key, JSONObject cursor) throws Exception {
        if (cursor == null || cursor.isNull("created_at") || cursor.isNull("change_id")) {
            deleteValue(database, key);
        } else {
            JSONObject normalized = new JSONObject();
            normalized.put("created_at", cursor.getString("created_at"));
            normalized.put("change_id", cursor.getString("change_id"));
            saveValue(database, key, normalized.toString(), Instant.now().toString());
        }
        return loadJsonCursor(database, key);
    }

    static String loadValue(SQLiteDatabase database, String key) {
        try (Cursor cursor = database.query(META_TABLE, new String[] { "value" }, "key = ?", new String[] { key }, null, null, null)) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            String stored = cursor.getString(0);
            return stored == null || stored.trim().isEmpty() ? null : stored;
        }
    }

    static void deleteValue(SQLiteDatabase database, String key) {
        database.delete(META_TABLE, "key = ?", new String[] { key });
    }

    static void saveValue(SQLiteDatabase database, String key, String value, String updatedAt) {
        ContentValues values = new ContentValues();
        values.put("key", key);
        values.put("value", value);
        values.put("updated_at", updatedAt);
        database.insertWithOnConflict(META_TABLE, null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }
}
