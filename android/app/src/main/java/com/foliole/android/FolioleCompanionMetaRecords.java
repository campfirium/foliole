package com.foliole.android;

import android.content.Context;
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
        String deviceId = loadValue(context, database, DEVICE_ID_KEY);
        if (deviceId != null) {
            return deviceId;
        }
        String nextDeviceId = "device-" + UUID.randomUUID();
        saveValue(context, database, DEVICE_ID_KEY, nextDeviceId, now);
        return nextDeviceId;
    }

    static JSObject loadNumberCursor(Context context, SQLiteDatabase database, String key) throws Exception {
        JSObject result = new JSObject();
        int cursor = loadNumberCursorValue(context, database, key);
        result.put(FolioleCompanionSyncProtocolDefinitions.syncCursorCursorPayloadKey(context), cursor <= 0 ? JSONObject.NULL : cursor);
        return result;
    }

    static JSObject saveNumberCursor(Context context, SQLiteDatabase database, String key, Integer cursor) throws Exception {
        saveNumberCursorValue(context, database, key, cursor == null ? 0 : cursor);
        return loadNumberCursor(context, database, key);
    }

    static int loadNumberCursorValue(Context context, SQLiteDatabase database, String key) throws Exception {
        String stored = loadValue(context, database, key);
        return stored == null ? 0 : Math.max(0, Integer.parseInt(stored));
    }

    static void saveNumberCursorValue(Context context, SQLiteDatabase database, String key, int cursor) throws Exception {
        if (cursor <= 0) {
            deleteValue(context, database, key);
        } else {
            saveValue(context, database, key, String.valueOf(cursor), Instant.now().toString());
        }
    }

    static JSObject loadJsonCursor(Context context, SQLiteDatabase database, String key) throws Exception {
        JSObject result = new JSObject();
        String stored = loadValue(context, database, key);
        result.put(FolioleCompanionSyncProtocolDefinitions.syncCursorCursorPayloadKey(context), stored == null ? JSONObject.NULL : new JSONObject(stored));
        return result;
    }

    static JSObject saveJsonCursor(Context context, SQLiteDatabase database, String key, JSONObject cursor) throws Exception {
        String createdAtKey = FolioleCompanionSyncProtocolDefinitions.syncCursorCreatedAtPayloadKey(context);
        String changeIdKey = FolioleCompanionSyncProtocolDefinitions.syncCursorChangeIdPayloadKey(context);
        if (cursor == null || cursor.isNull(createdAtKey) || cursor.isNull(changeIdKey)) {
            deleteValue(context, database, key);
        } else {
            JSONObject normalized = new JSONObject();
            normalized.put(createdAtKey, cursor.getString(createdAtKey));
            normalized.put(changeIdKey, cursor.getString(changeIdKey));
            saveValue(context, database, key, normalized.toString(), Instant.now().toString());
        }
        return loadJsonCursor(context, database, key);
    }

    static String loadValue(Context context, SQLiteDatabase database, String key) throws Exception {
        String stored = FolioleCompanionGeneratedQueryRunner.loadString(
            context,
            database,
            runtimeRule(context, "companionMeta", "queryName"),
            new String[] { key }
        );
        return stored == null || stored.trim().isEmpty() ? null : stored;
    }

    static void deleteValue(Context context, SQLiteDatabase database, String key) throws Exception {
        FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "deleteByKeyMutationName"), new Object[] { key });
    }

    static void saveValue(Context context, SQLiteDatabase database, String key, String value, String updatedAt) throws Exception {
        FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "upsertMutationName"), new Object[] {
            key,
            value,
            updatedAt
        });
    }

    private static String runtimeRule(Context context, String groupName, String key) throws Exception {
        return FolioleCompanionRuntimeQueryRules.stringValue(context, groupName, key);
    }

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionHostSupportMutationRules.companionMetaString(context, key);
    }

}
