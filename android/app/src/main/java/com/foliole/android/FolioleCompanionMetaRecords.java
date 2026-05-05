package com.foliole.android;

import android.content.Context;
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

    static String loadOrCreateDeviceId(Context context, SQLiteDatabase database, String now) throws Exception {
        String deviceId = loadValue(database, DEVICE_ID_KEY);
        if (deviceId != null) {
            return deviceId;
        }
        String nextDeviceId = "android-" + UUID.randomUUID();
        saveValue(context, database, DEVICE_ID_KEY, nextDeviceId, now);
        return nextDeviceId;
    }

    static JSObject loadNumberCursor(SQLiteDatabase database, String key) throws Exception {
        JSObject result = new JSObject();
        int cursor = loadNumberCursorValue(database, key);
        result.put("cursor", cursor <= 0 ? JSONObject.NULL : cursor);
        return result;
    }

    static JSObject saveNumberCursor(Context context, SQLiteDatabase database, String key, Integer cursor) throws Exception {
        saveNumberCursorValue(context, database, key, cursor == null ? 0 : cursor);
        return loadNumberCursor(database, key);
    }

    static int loadNumberCursorValue(SQLiteDatabase database, String key) {
        String stored = loadValue(database, key);
        return stored == null ? 0 : Math.max(0, Integer.parseInt(stored));
    }

    static void saveNumberCursorValue(Context context, SQLiteDatabase database, String key, int cursor) throws Exception {
        if (cursor <= 0) {
            deleteValue(context, database, key);
        } else {
            saveValue(context, database, key, String.valueOf(cursor), Instant.now().toString());
        }
    }

    static JSObject loadJsonCursor(SQLiteDatabase database, String key) throws Exception {
        JSObject result = new JSObject();
        String stored = loadValue(database, key);
        result.put("cursor", stored == null ? JSONObject.NULL : new JSONObject(stored));
        return result;
    }

    static JSObject saveJsonCursor(Context context, SQLiteDatabase database, String key, JSONObject cursor) throws Exception {
        if (cursor == null || cursor.isNull("created_at") || cursor.isNull("change_id")) {
            deleteValue(context, database, key);
        } else {
            JSONObject normalized = new JSONObject();
            normalized.put("created_at", cursor.getString("created_at"));
            normalized.put("change_id", cursor.getString("change_id"));
            saveValue(context, database, key, normalized.toString(), Instant.now().toString());
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

    static void deleteValue(Context context, SQLiteDatabase database, String key) throws Exception {
        FolioleCompanionNamedMutationStore.execute(context, database, "companionMetaDeleteByKey", new Object[] { key });
    }

    static void saveValue(Context context, SQLiteDatabase database, String key, String value, String updatedAt) throws Exception {
        FolioleCompanionNamedMutationStore.execute(context, database, "companionMetaUpsert", new Object[] {
            key,
            value,
            updatedAt
        });
    }
}
