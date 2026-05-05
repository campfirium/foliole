package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionSyncPackStateRows {
    private FolioleCompanionSyncPackStateRows() {}

    static int upsert(SQLiteDatabase database, String deviceId, String applyableRowsSql) {
        long nextStateSeq = nextStateSeq(database);
        int count = 0;
        try (Cursor cursor = database.rawQuery(
            "SELECT object_type, object_id, content_hash, updated_at, deleted_at FROM " +
                applyableRowsSql + " WHERE object_type IN (" +
                "'attachment', 'external_folder', 'import_source', 'node', 'external_document', " +
                "'node_reading', 'node_review', 'pdf_page_text', 'setting', 'view_state') ORDER BY state_seq ASC",
            null
        )) {
            while (cursor.moveToNext()) {
                insertCleanStateRow(database, cursor, deviceId, nextStateSeq);
                nextStateSeq += 1;
                count += 1;
            }
        }
        return count;
    }

    private static void insertCleanStateRow(
        SQLiteDatabase database,
        Cursor cursor,
        String deviceId,
        long stateSeq
    ) {
        ContentValues values = new ContentValues();
        values.put("object_type", cursor.getString(0));
        values.put("object_id", cursor.getString(1));
        values.put("state_seq", stateSeq);
        values.putNull("current_version_id");
        values.put("content_hash", cursor.getString(2));
        values.putNull("base_content_hash");
        values.put("last_modified_by_device_id", deviceId);
        values.put("updated_at", cursor.getString(3));
        if (cursor.isNull(4)) {
            values.putNull("deleted_at");
        } else {
            values.put("deleted_at", cursor.getString(4));
        }
        values.put("sync_dirty", 0);
        database.insertWithOnConflict("sync_object_state", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static long nextStateSeq(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery("SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state", null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 1L;
        }
    }
}
