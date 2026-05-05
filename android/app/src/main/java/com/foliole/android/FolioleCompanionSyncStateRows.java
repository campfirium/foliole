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
        ExistingState current = loadExistingState(database, objectType, objectId);
        values.put("object_type", objectType);
        values.put("object_id", objectId);
        values.put("state_seq", nextStateSeq(database));
        values.put("current_version_id", currentVersionId);
        values.put("content_hash", contentHash);
        values.put("base_content_hash", nextBaseContentHash(current, syncDirty));
        values.put("last_modified_by_device_id", deviceId);
        values.put("updated_at", updatedAt);
        values.put("deleted_at", deletedAt);
        values.put("sync_dirty", syncDirty);
        database.insertWithOnConflict("sync_object_state", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static String nextBaseContentHash(ExistingState current, int syncDirty) {
        if (syncDirty != 1) {
            return null;
        }
        if (current == null) {
            return null;
        }
        return current.syncDirty == 1 && current.baseContentHash != null
            ? current.baseContentHash
            : current.contentHash;
    }

    private static ExistingState loadExistingState(SQLiteDatabase database, String objectType, String objectId) {
        try (Cursor cursor = database.rawQuery(
            "SELECT content_hash, base_content_hash, sync_dirty FROM sync_object_state WHERE object_type = ? AND object_id = ? LIMIT 1",
            new String[] { objectType, objectId }
        )) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            return new ExistingState(
                cursor.getString(0),
                cursor.isNull(1) ? null : cursor.getString(1),
                cursor.getInt(2)
            );
        }
    }

    private static long nextStateSeq(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery("SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state", null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 1L;
        }
    }

    private static final class ExistingState {
        final String contentHash;
        final String baseContentHash;
        final int syncDirty;

        ExistingState(String contentHash, String baseContentHash, int syncDirty) {
            this.contentHash = contentHash;
            this.baseContentHash = baseContentHash;
            this.syncDirty = syncDirty;
        }
    }
}
