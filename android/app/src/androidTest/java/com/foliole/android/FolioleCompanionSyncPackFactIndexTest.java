package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;
import org.junit.Test;

public final class FolioleCompanionSyncPackFactIndexTest {
    @Test public void readsSnapshotMetadataOnAndroidSystemSqlite() throws Exception {
        SQLiteDatabase pack = SQLiteDatabase.create(null);
        try {
            pack.execSQL("CREATE TABLE node_sync_versions (version_id TEXT, object_id TEXT, " +
                "parent_version_id TEXT, host_name TEXT, created_at TEXT, content_hash TEXT, " +
                "body_text TEXT, snapshot_json TEXT)");
            pack.execSQL("CREATE TABLE node_sync_version_parents " +
                "(version_id TEXT, parent_version_id TEXT, ordinal INTEGER)");
            pack.execSQL("CREATE TABLE review_log (id TEXT, op_id TEXT, host_name TEXT, node_id TEXT, " +
                "grade INTEGER, scheduler_version TEXT, reviewed_at TEXT, due_before TEXT, " +
                "stability_before REAL, difficulty_before REAL, due_after TEXT, " +
                "stability_after REAL, difficulty_after REAL)");
            pack.execSQL("INSERT INTO node_sync_versions VALUES " +
                "('v1', 'node', NULL, 'host', 'now', 'hash', 'body', " +
                "'{\"id\":\"node\",\"content\":null,\"url\":\"https://example.test/a\"}')");
            JSONObject fact = FolioleCompanionSyncPackFactIndex.read(pack, 0, 1, 1, "epoch")
                .getJSONArray("versions").getJSONObject(0);
            assertEquals("{\"id\":\"node\",\"url\":\"https://example.test/a\"}",
                fact.getString("snapshot_metadata"));
        } finally { pack.close(); }
    }

    @Test public void pagedFactPreservesEmptyAndUnavailableBodyDistinction() throws Exception {
        SQLiteDatabase pack = SQLiteDatabase.create(null);
        try {
            pack.execSQL("CREATE TABLE versions (version_id TEXT, object_id TEXT, " +
                "parent_version_id TEXT, host_name TEXT, created_at TEXT, content_hash TEXT, " +
                "body_text TEXT, snapshot_json TEXT)");
            pack.execSQL("INSERT INTO versions VALUES ('empty','node',NULL,'host','now'," +
                "'hash',NULL,'{\"id\":\"node\"}')");
            pack.execSQL("INSERT INTO versions VALUES ('missing','node',NULL,'host','now'," +
                "'hash',NULL,'{\"id\":\"node\",\"content\":null}')");
            try (Cursor rows = pack.rawQuery("SELECT * FROM versions ORDER BY version_id", null)) {
                rows.moveToFirst();
                JSONObject empty = FolioleCompanionSyncPackFactPages.fact(0, rows);
                assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                    empty.getString("body_hash"));
                rows.moveToNext();
                JSONObject missing = FolioleCompanionSyncPackFactPages.fact(0, rows);
                assertFalse(empty.isNull("body_hash"));
                assertEquals(JSONObject.NULL, missing.get("body_hash"));
            }
        } finally { pack.close(); }
    }

}
