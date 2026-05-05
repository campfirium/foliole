package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionSyncStateRows {

    private FolioleCompanionSyncStateRows() {}

    static void upsert(
        SQLiteDatabase database,
        String objectType,
        String objectId,
        String currentVersionId,
        String contentHash,
        String deviceId,
        String updatedAt,
        String deletedAt,
        int syncDirty
    ) {
        ContentValues values = new ContentValues();
        values.put("object_type", objectType);
        values.put("object_id", objectId);
        values.put("state_seq", nextStateSeq(database));
        values.put("current_version_id", currentVersionId);
        values.put("content_hash", contentHash);
        values.put("last_modified_by_device_id", deviceId);
        values.put("updated_at", updatedAt);
        values.put("deleted_at", deletedAt);
        values.put("sync_dirty", syncDirty);
        database.insertWithOnConflict("sync_object_state", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static long nextStateSeq(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery("SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state", null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 1L;
        }
    }
}
