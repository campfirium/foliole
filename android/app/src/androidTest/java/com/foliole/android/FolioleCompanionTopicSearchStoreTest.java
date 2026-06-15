package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionTopicSearchStoreTest {
    private SQLiteDatabase database;

    @Before
    public void setUp() {
        database = SQLiteDatabase.create(null);
        database.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, title TEXT, opening_text TEXT, content TEXT NOT NULL DEFAULT '', " +
            "body_blob_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)");
        database.execSQL("CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL)");
        database.execSQL("CREATE TABLE content_blobs (" +
            "hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT, " +
            "compression TEXT NOT NULL DEFAULT 'none', original_size_bytes INTEGER NOT NULL, " +
            "stored_size_bytes INTEGER NOT NULL, original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL, " +
            "availability TEXT NOT NULL DEFAULT 'missing', source_device_id TEXT, created_at TEXT NOT NULL, " +
            "cached_at TEXT, last_verified_at TEXT)");
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void searchesTopicBodyBlobData() throws Exception {
        insertTopic("topic-1", "Alpha Topic", "opening", "", "body-hash", null);
        database.execSQL("INSERT INTO content_blob_data (hash, data) VALUES ('body-hash', CAST('cached alpha body' AS BLOB))");

        JSObject loaded = FolioleCompanionTopicSearchStore.searchTopics(
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext(),
            database,
            "ALPHA",
            10
        );
        JSONArray results = loaded.getJSONArray("results");

        assertEquals("ALPHA", loaded.getString("query"));
        assertEquals(1, results.length());
        assertEquals("topic-1", results.getJSONObject(0).getString("node_id"));
        assertEquals("ready", results.getJSONObject(0).getString("content_status"));
        assertEquals("cached alpha body", results.getJSONObject(0).getString("excerpt"));
    }

    @Test
    public void doesNotSearchMissingBodyBlobAsInlineContent() throws Exception {
        insertTopic("topic-1", "Missing Topic", "opening alpha", "stale inline body", "missing-hash", null);

        JSONArray bodyResults = FolioleCompanionTopicSearchStore.searchTopics(
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext(),
            database,
            "body",
            10
        ).getJSONArray("results");
        JSONArray openingResults = FolioleCompanionTopicSearchStore.searchTopics(
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext(),
            database,
            "alpha",
            10
        ).getJSONArray("results");

        assertEquals(0, bodyResults.length());
        assertEquals(1, openingResults.length());
        assertEquals("missing", openingResults.getJSONObject(0).getString("content_status"));
    }

    @Test
    public void ignoresDeletedTopics() throws Exception {
        insertTopic("topic-1", "Deleted Topic", "deleted alpha", "deleted alpha", null, "2026-04-26T02:00:00.000Z");

        JSONArray results = FolioleCompanionTopicSearchStore.searchTopics(
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext(),
            database,
            "alpha",
            10
        ).getJSONArray("results");

        assertEquals(0, results.length());
    }

    private void insertTopic(String id, String title, String opening, String content, String bodyBlobHash, String deletedAt) {
        database.execSQL(
            "INSERT INTO nodes (id, title, opening_text, content, body_blob_hash, created_at, updated_at, deleted_at) " +
                "VALUES (?, ?, ?, ?, ?, '2026-04-26T01:00:00.000Z', '2026-04-26T01:00:00.000Z', ?)",
            new Object[] { id, title, opening, content, bodyBlobHash, deletedAt }
        );
    }
}
