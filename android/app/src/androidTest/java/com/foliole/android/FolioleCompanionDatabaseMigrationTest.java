package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionDatabaseMigrationTest {

    @Test
    public void v4SyncObjectStateRowsSurviveStateSeqMigration() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SQLiteDatabase database = SQLiteDatabase.create(null);
        try {
            createLegacySyncObjectState(database);
            database.execSQL(
                "INSERT INTO sync_object_state (" +
                    "object_type, object_id, current_version_id, content_hash, last_modified_by_device_id, updated_at, deleted_at, sync_dirty" +
                    ") VALUES ('node_review', 'node-2', 'version-2', 'hash-2', 'android-1', '2026-05-03T02:00:00.000Z', NULL, 1)"
            );
            database.execSQL(
                "INSERT INTO sync_object_state (" +
                    "object_type, object_id, current_version_id, content_hash, last_modified_by_device_id, updated_at, deleted_at, sync_dirty" +
                    ") VALUES ('node', 'node-1', 'version-1', 'hash-1', 'desktop-1', '2026-05-03T01:00:00.000Z', NULL, 0)"
            );

            FolioleCompanionDatabaseMigration.upgrade(context, database, 4);

            assertTrue(columnExists(database, "sync_object_state", "state_seq"));
            assertTrue(columnExists(database, "sync_object_state", "base_content_hash"));
            assertTrue(tableExists(database, "sync_peer_cursors"));
            assertEquals(2, countRows(database, "sync_object_state"));
            assertEquals(1, selectStateSeq(database, "node", "node-1"));
            assertEquals(2, selectStateSeq(database, "node_review", "node-2"));
            assertFalse(tableExists(database, "sync_object_state_next"));
        } finally {
            database.close();
        }
    }

    private static void createLegacySyncObjectState(SQLiteDatabase database) {
        database.execSQL(
            "CREATE TABLE sync_object_state (" +
                "object_type TEXT NOT NULL," +
                "object_id TEXT NOT NULL," +
                "current_version_id TEXT," +
                "content_hash TEXT NOT NULL," +
                "last_modified_by_device_id TEXT NOT NULL," +
                "updated_at TEXT NOT NULL," +
                "deleted_at TEXT," +
                "sync_dirty INTEGER NOT NULL DEFAULT 0," +
                "PRIMARY KEY (object_type, object_id)" +
                ")"
        );
    }

    private static boolean tableExists(SQLiteDatabase database, String table) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            new String[] { table }
        )) {
            return cursor.moveToFirst();
        }
    }

    private static boolean columnExists(SQLiteDatabase database, String table, String column) {
        try (Cursor cursor = database.rawQuery("PRAGMA table_info(" + table + ")", null)) {
            while (cursor.moveToNext()) {
                if (column.equals(cursor.getString(cursor.getColumnIndexOrThrow("name")))) {
                    return true;
                }
            }
        }
        return false;
    }

    private static int countRows(SQLiteDatabase database, String table) {
        try (Cursor cursor = database.rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    private static int selectStateSeq(SQLiteDatabase database, String objectType, String objectId) {
        try (Cursor cursor = database.rawQuery(
            "SELECT state_seq FROM sync_object_state WHERE object_type = ? AND object_id = ?",
            new String[] { objectType, objectId }
        )) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }
}
