package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteStatement;

final class FolioleCompanionSyncPackStateRows {
    private FolioleCompanionSyncPackStateRows() {}

    static int upsert(SQLiteDatabase database, String deviceId, String applyableRowsSql) {
        long nextStateSeq = nextStateSeq(database);
        String nodeVersionExpression = incomingColumnExists(database, "nodes", "current_version_id")
            ? "SELECT current_version_id FROM inc.nodes WHERE inc.nodes.id = object_id"
            : "SELECT current_version_id FROM main.nodes WHERE main.nodes.id = object_id";
        int count = 0;
        try (
            Cursor cursor = database.rawQuery(
            "SELECT object_type, object_id, content_hash, updated_at, deleted_at, " +
                "CASE WHEN object_type = 'node' THEN (" +
                    nodeVersionExpression +
                ") ELSE NULL END FROM " +
                applyableRowsSql + " WHERE object_type IN (" +
                "'attachment', 'external_folder', 'import_source', 'node', 'external_document', " +
                "'node_reading', 'node_review', 'pdf_page_text', 'setting', 'view_state') ORDER BY state_seq ASC",
            null
            );
            SQLiteStatement insertState = database.compileStatement(
                "INSERT OR REPLACE INTO sync_object_state (" +
                    "object_type, object_id, state_seq, current_version_id, content_hash, base_content_hash, " +
                    "last_modified_by_device_id, updated_at, deleted_at, sync_dirty" +
                ") VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 0)"
            )
        ) {
            while (cursor.moveToNext()) {
                insertCleanStateRow(insertState, cursor, deviceId, nextStateSeq);
                nextStateSeq += 1;
                count += 1;
            }
        }
        return count;
    }

    private static void insertCleanStateRow(
        SQLiteStatement insertState,
        Cursor cursor,
        String deviceId,
        long stateSeq
    ) {
        insertState.clearBindings();
        insertState.bindString(1, cursor.getString(0));
        insertState.bindString(2, cursor.getString(1));
        insertState.bindLong(3, stateSeq);
        if (cursor.isNull(5)) {
            insertState.bindNull(4);
        } else {
            insertState.bindString(4, cursor.getString(5));
        }
        insertState.bindString(5, cursor.getString(2));
        insertState.bindString(6, deviceId);
        insertState.bindString(7, cursor.getString(3));
        if (cursor.isNull(4)) {
            insertState.bindNull(8);
        } else {
            insertState.bindString(8, cursor.getString(4));
        }
        insertState.executeInsert();
    }

    private static long nextStateSeq(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery("SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state", null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 1L;
        }
    }

    private static boolean incomingColumnExists(SQLiteDatabase database, String tableName, String columnName) {
        try (Cursor cursor = database.rawQuery("PRAGMA inc.table_info(" + tableName + ")", null)) {
            while (cursor.moveToNext()) {
                if (columnName.equals(cursor.getString(1))) {
                    return true;
                }
            }
        }
        return false;
    }
}
