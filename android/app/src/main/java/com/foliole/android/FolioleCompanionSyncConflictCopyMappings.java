package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionSyncConflictCopyMappings {

    private static final String CONFLICT_COPY_KEY_PREFIX = "sync_conflict_copy:";

    private FolioleCompanionSyncConflictCopyMappings() {}

    static String load(SQLiteDatabase database, String versionId) {
        if (!tableExists(database, "companion_meta")) {
            return null;
        }
        try (Cursor cursor = database.rawQuery(
            "SELECT value FROM companion_meta WHERE key = ? LIMIT 1",
            new String[] { CONFLICT_COPY_KEY_PREFIX + versionId }
        )) {
            return cursor.moveToFirst() ? cursor.getString(0) : null;
        }
    }

    static void save(SQLiteDatabase database, String versionId, String copyNodeId, String now) {
        if (!tableExists(database, "companion_meta")) {
            return;
        }
        ContentValues values = new ContentValues();
        values.put("key", CONFLICT_COPY_KEY_PREFIX + versionId);
        values.put("value", copyNodeId);
        values.put("updated_at", now);
        database.insertWithOnConflict("companion_meta", null, values, SQLiteDatabase.CONFLICT_REPLACE);
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
