package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.getcapacitor.JSObject;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionReadableArticleBodyStatusTest {
    private SQLiteDatabase database;

    @Before
    public void setUp() {
        database = SQLiteDatabase.create(null);
        createTables();
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void reportsMissingReadableBodyWithoutDroppingTheTopic() throws Exception {
        insertNode("article-1", "", "blob-article-1");
        insertBlobManifest("blob-article-1", "missing");
        saveActiveNode("article-1");

        JSObject readable = FolioleCompanionReadableArticleQuery.loadReadableArticle(database);
        JSObject snapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext(), database, "android-test");

        JSONObject article = readable.getJSONObject("readable_article");
        assertEquals("article-1", article.getString("node_id"));
        assertEquals("", article.getString("content"));
        assertEquals("missing", article.getString("content_status"));
        assertEquals("missing", snapshot.getJSONObject("nodesById").getJSONObject("article-1").getString("bodyStatus"));
    }

    @Test
    public void reportsFetchingAndFailedReadableBodiesWithoutDroppingTheTopic() throws Exception {
        insertNode("fetching-article", "", "blob-fetching");
        insertNode("failed-article", "", "blob-failed");
        insertBlobManifest("blob-fetching", "fetching");
        insertBlobManifest("blob-failed", "failed");
        saveActiveNode("fetching-article");

        JSObject readable = FolioleCompanionReadableArticleQuery.loadReadableArticle(database);
        JSObject snapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext(), database, "android-test");

        assertEquals("fetching", readable.getJSONObject("readable_article").getString("content_status"));
        assertEquals("fetching", snapshot.getJSONObject("nodesById").getJSONObject("fetching-article").getString("bodyStatus"));
        assertEquals("failed", snapshot.getJSONObject("nodesById").getJSONObject("failed-article").getString("bodyStatus"));
    }

    @Test
    public void reportsEmptyReadableBodyWithoutTreatingItAsMissing() throws Exception {
        insertNode("article-1", "", null);
        saveActiveNode("article-1");

        JSObject readable = FolioleCompanionReadableArticleQuery.loadReadableArticle(database);
        JSObject snapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext(), database, "android-test");

        JSONObject article = readable.getJSONObject("readable_article");
        assertEquals("article-1", article.getString("node_id"));
        assertEquals("", article.getString("content"));
        assertEquals("empty", article.getString("content_status"));
        assertEquals("empty", snapshot.getJSONObject("nodesById").getJSONObject("article-1").getString("bodyStatus"));
    }

    private void createTables() {
        database.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL DEFAULT 'topic', priority INTEGER, " +
            "desired_retention REAL, title TEXT NOT NULL, is_title_manual INTEGER NOT NULL DEFAULT 0, " +
            "hide_title_heading INTEGER NOT NULL DEFAULT 0, content TEXT NOT NULL DEFAULT '', body_blob_hash TEXT, " +
            "opening_text TEXT, virtual_filter TEXT, reveal TEXT, anchor_link TEXT, image_regions TEXT, " +
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)");
        database.execSQL("CREATE TABLE content_blobs (" +
            "hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT, " +
            "compression TEXT NOT NULL DEFAULT 'none', original_size_bytes INTEGER NOT NULL, " +
            "stored_size_bytes INTEGER NOT NULL, original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL, " +
            "availability TEXT NOT NULL DEFAULT 'missing', source_device_id TEXT, created_at TEXT NOT NULL, " +
            "cached_at TEXT, last_verified_at TEXT)");
        database.execSQL("CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL)");
        database.execSQL("CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL)");
        database.execSQL("CREATE TABLE node_reading (node_id TEXT PRIMARY KEY, interval_duration_ms INTEGER, " +
            "interval_growth_factor REAL, last_handled_at TEXT, next_at TEXT, priority REAL, repetition_count INTEGER, state TEXT)");
        database.execSQL("CREATE TABLE node_reading_device_state (node_id TEXT, device_id TEXT, reading_position INTEGER, " +
            "updated_at TEXT, PRIMARY KEY (node_id, device_id))");
        database.execSQL("CREATE TABLE node_review (node_id TEXT PRIMARY KEY, due TEXT, last_review_at TEXT, state INTEGER, " +
            "stability REAL, difficulty REAL, elapsed_days INTEGER, scheduled_days INTEGER, reps INTEGER, lapses INTEGER)");
        database.execSQL("CREATE TABLE node_view_state (node_id TEXT NOT NULL, device_id TEXT NOT NULL, " +
            "scroll_top INTEGER NOT NULL DEFAULT 0, selection_from INTEGER, selection_to INTEGER, " +
            "source TEXT NOT NULL DEFAULT 'user-scroll', updated_at TEXT NOT NULL, PRIMARY KEY (node_id, device_id))");
        database.execSQL("CREATE TABLE attachments (id TEXT PRIMARY KEY, original_name TEXT, mime_type TEXT, size_bytes INTEGER, " +
            "created_at TEXT, storage_key TEXT, cached_at TEXT)");
        database.execSQL("CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT, role TEXT, created_at TEXT, " +
            "PRIMARY KEY (node_id, attachment_id, role))");
        database.execSQL("CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
    }

    private void insertNode(String nodeId, String content, String bodyBlobHash) {
        database.execSQL(
            "INSERT INTO nodes (id, title, content, body_blob_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            new Object[] { nodeId, "Article", content, bodyBlobHash, "2026-04-25T09:00:00.000Z", "2026-04-25T09:00:00.000Z" }
        );
        database.execSQL("INSERT INTO node_order (node_id, position) VALUES (?, 0)", new Object[] { nodeId });
    }

    private void insertBlobManifest(String hash, String availability) {
        database.execSQL(
            "INSERT INTO content_blobs (" +
                "hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
                "original_sha256, stored_sha256, availability, source_device_id, created_at) " +
                "VALUES (?, ?, 'text_body', 'text/plain', 'none', 0, 0, ?, ?, ?, 'desktop', '2026-04-25T09:00:00.000Z')",
            new Object[] { hash, "text/" + hash, hash, hash, availability }
        );
    }

    private void saveActiveNode(String nodeId) {
        database.execSQL(
            "INSERT INTO workspace_meta (key, value, updated_at) VALUES ('active_node_id', ?, '2026-04-25T09:00:00.000Z')",
            new Object[] { nodeId }
        );
    }
}
