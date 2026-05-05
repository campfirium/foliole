package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncTombstoneApplyTest {

    private SQLiteDatabase database;

    @Before
    public void setUp() {
        database = SQLiteDatabase.create(null);
        database.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL DEFAULT 'topic', priority INTEGER, " +
            "desired_retention REAL, title TEXT NOT NULL, is_title_manual INTEGER NOT NULL DEFAULT 0, " +
            "hide_title_heading INTEGER NOT NULL DEFAULT 0, content TEXT NOT NULL DEFAULT '', body_blob_hash TEXT, opening_text TEXT, " +
            "virtual_filter TEXT, reveal TEXT, anchor_link TEXT, image_regions TEXT, position INTEGER, " +
            "current_version_id TEXT, last_modified_by_device_id TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0, " +
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)");
        database.execSQL("CREATE TABLE node_sync_versions (" +
            "version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL, parent_version_id TEXT, device_id TEXT NOT NULL, " +
            "created_at TEXT NOT NULL, content_hash TEXT NOT NULL, snapshot_json TEXT)");
        database.execSQL("CREATE TABLE node_sync_conflicts (" +
            "conflict_version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL, parent_version_id TEXT, " +
            "device_id TEXT, content_hash TEXT, snapshot_json TEXT NOT NULL, detected_at TEXT NOT NULL)");
        database.execSQL("CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL)");
        database.execSQL("CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL DEFAULT '', " +
            "kind TEXT NOT NULL DEFAULT 'text_body', mime_type TEXT, compression TEXT NOT NULL DEFAULT 'none', " +
            "original_size_bytes INTEGER NOT NULL DEFAULT 0, stored_size_bytes INTEGER NOT NULL DEFAULT 0, " +
            "original_sha256 TEXT NOT NULL DEFAULT '', stored_sha256 TEXT NOT NULL DEFAULT '', " +
            "availability TEXT NOT NULL DEFAULT 'missing', source_device_id TEXT, created_at TEXT NOT NULL, " +
            "cached_at TEXT, last_verified_at TEXT)");
        database.execSQL("CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL)");
        database.execSQL("INSERT INTO nodes (id, kind, title, content, current_version_id, sync_dirty, created_at, updated_at) " +
            "VALUES ('node-1', 'item', 'Node', 'local dirty body', 'desktop#2', 1, " +
            "'2026-04-26T00:00:00.000Z', '2026-04-26T01:00:00.000Z')");
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void appliesRemoteTombstoneOverDirtyActiveLocalNode() throws Exception {
        JSObject applied = FolioleCompanionSyncNodeVersionApplyHarness.applyNodeVersions(
            database,
            new JSONArray().put(tombstoneRecord()),
            "android-test"
        );

        assertEquals(1, applied.getJSONArray("applied_node_ids").length());
        assertEquals("desktop#delete", selectString("current_version_id"));
        assertEquals("2026-04-26T02:00:00.000Z", selectString("deleted_at"));
        assertEquals(0, selectInt("sync_dirty"));
    }

    private static JSONObject tombstoneRecord() throws Exception {
        String deletedAt = "2026-04-26T02:00:00.000Z";
        JSONObject snapshot = new JSONObject()
            .put("id", "node-1")
            .put("kind", "item")
            .put("title", "Deleted Node")
            .put("content", "deleted body")
            .put("created_at", "2026-04-26T00:00:00.000Z")
            .put("updated_at", deletedAt)
            .put("deleted_at", deletedAt);
        return new JSONObject()
            .put("version_id", "desktop#delete")
            .put("object_id", "node-1")
            .put("object_type", "node")
            .put("parent_version_id", "desktop#2")
            .put("device_id", "desktop")
            .put("version_created_at", deletedAt)
            .put("updated_at", deletedAt)
            .put("content_hash", "hash-delete")
            .put("snapshot", snapshot)
            .put("ancestor_version_ids", new JSONArray().put("desktop#2"));
    }

    private String selectString(String column) {
        try (Cursor cursor = database.rawQuery("SELECT " + column + " FROM nodes WHERE id = 'node-1'", null)) {
            cursor.moveToFirst();
            return cursor.isNull(0) ? null : cursor.getString(0);
        }
    }

    private int selectInt(String column) {
        try (Cursor cursor = database.rawQuery("SELECT " + column + " FROM nodes WHERE id = 'node-1'", null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }
}
