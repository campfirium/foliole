package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

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
public class FolioleCompanionWorkspaceExportAfterSyncApplyTest {

    private SQLiteDatabase database;

    @Before
    public void setUp() {
        database = SQLiteDatabase.create(null);
        createTables();
        insertNode("article-1", "First article", "Old body", "2026-04-25T08:00:00.000Z");
        insertNode("article-2", "Second article", "Fresh body", "2026-04-25T09:00:00.000Z");
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void exportsLatestLearningAndActiveArticleAfterSyncPayloadsApply() throws Exception {
        FolioleCompanionSyncObjectApply.applyPayload(database, record(
            "node_reading",
            "article-1",
            "{\"next_at\":\"2026-04-25T10:00:00.000Z\",\"last_handled_at\":\"2026-04-25T09:00:00.000Z\",\"state\":\"active\",\"device_id\":\"remote-device\",\"reading_position\":32}"
        ));
        FolioleCompanionSyncObjectApply.applyPayload(database, record(
            "node_review",
            "article-1",
            "{\"due\":\"2026-04-26T10:00:00.000Z\",\"last_review_at\":\"2026-04-25T09:00:00.000Z\",\"state\":2,\"reps\":4}"
        ));
        FolioleCompanionSyncObjectApply.applyPayload(database, record(
            "view_state",
            "session_resume:android:phone:remote-device:active_node",
            "{\"active_node_id\":\"article-2\"}"
        ));

        JSObject snapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(database, "remote-device");
        JSObject readable = FolioleCompanionReadableArticleQuery.loadReadableArticle(database);

        assertNotNull(snapshot);
        assertEquals("article-2", snapshot.getString("activeNodeId"));
        JSONObject article = snapshot.getJSONObject("nodesById").getJSONObject("article-1");
        assertEquals(32, article.getJSONObject("reading").getInt("readingPosition"));
        assertEquals("2026-04-26T10:00:00.000Z", article.getJSONObject("review").getString("due"));
        assertEquals("article-2", readable.getJSONObject("readable_article").getString("node_id"));
        assertEquals("Fresh body", readable.getJSONObject("readable_article").getString("content"));
    }

    @Test
    public void loadsIndexedPdfPageTextAsReadableArticleContent() throws Exception {
        insertNode("pdf-1", "Paper", "# Paper\n\nLinked PDF source ready for the reader surface.", "2026-04-25T09:00:00.000Z");
        database.execSQL(
            "INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at, storage_key, cached_at) " +
                "VALUES ('attachment-pdf', 'paper.pdf', 'application/pdf', 1200, '2026-04-25T08:00:00.000Z', 'attachment-pdf', '2026-04-25T08:00:00.000Z')"
        );
        database.execSQL(
            "INSERT INTO node_attachments (node_id, attachment_id, role, created_at) " +
                "VALUES ('pdf-1', 'attachment-pdf', 'reference', '2026-04-25T08:00:00.000Z')"
        );
        database.execSQL(
            "INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height) VALUES " +
                "('attachment-pdf', 1, 'First extracted page.', 612, 792), " +
                "('attachment-pdf', 2, 'Second extracted page.', 612, 792)"
        );
        FolioleCompanionSyncObjectApply.applyPayload(database, record(
            "view_state",
            "session_resume:android:phone:remote-device:active_node",
            "{\"active_node_id\":\"pdf-1\"}"
        ));

        JSObject readable = FolioleCompanionReadableArticleQuery.loadReadableArticle(database);

        JSONObject article = readable.getJSONObject("readable_article");
        assertEquals("pdf-1", article.getString("node_id"));
        assertEquals("attachment-pdf", article.getString("pdf_attachment_id"));
        assertEquals("# Paper\n\nFirst extracted page.\n\nSecond extracted page.", article.getString("content"));
    }

    @Test
    public void loadsReadableArticleContentFromBodyBlobData() throws Exception {
        database.execSQL(
            "UPDATE nodes SET content = '', body_blob_hash = 'blob-article-2' WHERE id = 'article-2'"
        );
        database.execSQL(
            "INSERT INTO content_blob_data (hash, data) VALUES ('blob-article-2', CAST('Blob article body' AS BLOB))"
        );
        FolioleCompanionSyncObjectApply.applyPayload(database, record(
            "view_state",
            "session_resume:android:phone:remote-device:active_node",
            "{\"active_node_id\":\"article-2\"}"
        ));

        JSObject snapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(database, "android-test");
        JSObject readable = FolioleCompanionReadableArticleQuery.loadReadableArticle(database);

        assertEquals("Blob article body", snapshot.getJSONObject("nodesById")
            .getJSONObject("article-2").getString("content"));
        assertEquals("Blob article body", readable.getJSONObject("readable_article").getString("content"));
    }

    @Test
    public void exportsStateObjectPayloadsWithSnakeCaseWireFields() throws Exception {
        JSONArray records = new JSONArray()
            .put(record(
                "node_reading",
                "article-1",
                "{\"next_at\":\"2026-04-25T10:00:00.000Z\",\"last_handled_at\":\"2026-04-25T09:00:00.000Z\",\"state\":\"active\",\"device_id\":\"remote-device\",\"reading_position\":32,\"interval_duration_ms\":1200,\"interval_growth_factor\":1.2,\"priority\":0.5,\"repetition_count\":2}"
            ))
            .put(record(
                "node_review",
                "article-1",
                "{\"due\":\"2026-04-26T10:00:00.000Z\",\"last_review_at\":\"2026-04-25T09:00:00.000Z\",\"state\":2,\"reps\":4,\"elapsed_days\":1,\"scheduled_days\":3,\"stability\":2.4,\"difficulty\":4.2,\"lapses\":0}"
            ))
            .put(record(
                "view_state",
                "session_resume:android:phone:remote-device:active_node",
                "{\"active_node_id\":\"article-2\"}"
            ))
            .put(record(
                "view_state",
                "session_resume:android:phone:remote-device:node:article-1",
                "{\"node_id\":\"article-1\",\"scroll_top\":128,\"selection_from\":5,\"selection_to\":13,\"source\":\"user-scroll\"}"
            ));

        FolioleCompanionSyncObjectStore.applySyncObjects(database, records, "remote-device");
        JSObject loaded = FolioleCompanionSyncObjectStore.loadSyncObjects(
            database,
            new JSONArray()
                .put("article-1")
                .put("session_resume:android:phone:remote-device:active_node")
                .put("session_resume:android:phone:remote-device:node:article-1"),
            new JSONArray().put("node_reading").put("node_review").put("view_state")
        );

        JSONArray objects = loaded.getJSONArray("objects");
        String payloads = objects.toString();
        assertEquals(4, objects.length());
        assertEquals(false, payloads.contains("reading_position"));
        assertEquals(true, payloads.contains("last_review_at"));
        assertEquals(true, payloads.contains("active_node_id"));
        assertEquals(true, payloads.contains("scroll_top"));
        assertEquals(false, payloads.contains("readingPosition"));
        assertEquals(false, payloads.contains("lastReviewAt"));
        assertEquals(false, payloads.contains("activeNodeId"));
        assertEquals(false, payloads.contains("scrollTop"));
        assertEquals("sync-apply", loadViewStateSource("article-1", "remote-device"));
    }

    private String loadViewStateSource(String nodeId, String deviceId) {
        try (Cursor cursor = database.rawQuery(
            "SELECT source FROM node_view_state WHERE node_id = ? AND device_id = ?",
            new String[] { nodeId, deviceId }
        )) {
            return cursor.moveToFirst() ? cursor.getString(0) : null;
        }
    }

    private void createTables() {
        database.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL DEFAULT 'topic', priority INTEGER, " +
            "desired_retention REAL, title TEXT NOT NULL, is_title_manual INTEGER NOT NULL DEFAULT 0, " +
            "hide_title_heading INTEGER NOT NULL DEFAULT 0, content TEXT NOT NULL DEFAULT '', body_blob_hash TEXT, opening_text TEXT, " +
            "virtual_filter TEXT, reveal TEXT, anchor_link TEXT, image_regions TEXT, position INTEGER, " +
            "current_version_id TEXT, last_modified_by_device_id TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0, " +
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)");
        database.execSQL("CREATE TABLE node_review (node_id TEXT PRIMARY KEY, due TEXT NOT NULL, " +
            "last_review_at TEXT, state INTEGER NOT NULL DEFAULT 0, stability REAL NOT NULL DEFAULT 0, " +
            "difficulty REAL NOT NULL DEFAULT 0, elapsed_days INTEGER NOT NULL DEFAULT 0, " +
            "scheduled_days INTEGER NOT NULL DEFAULT 0, reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0)");
        database.execSQL("CREATE TABLE node_reading (node_id TEXT PRIMARY KEY, interval_duration_ms INTEGER NOT NULL DEFAULT 0, " +
            "interval_growth_factor REAL NOT NULL DEFAULT 1, last_handled_at TEXT NOT NULL, next_at TEXT NOT NULL, " +
            "priority REAL NOT NULL DEFAULT 0, repetition_count INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'active')");
        database.execSQL("CREATE TABLE node_reading_device_state (node_id TEXT NOT NULL, device_id TEXT NOT NULL, " +
            "reading_position INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (node_id, device_id))");
        database.execSQL("CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL)");
        database.execSQL("CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL DEFAULT '', " +
            "kind TEXT NOT NULL DEFAULT 'text_body', mime_type TEXT, compression TEXT NOT NULL DEFAULT 'none', " +
            "original_size_bytes INTEGER NOT NULL DEFAULT 0, stored_size_bytes INTEGER NOT NULL DEFAULT 0, " +
            "original_sha256 TEXT NOT NULL DEFAULT '', stored_sha256 TEXT NOT NULL DEFAULT '', " +
            "availability TEXT NOT NULL DEFAULT 'missing', source_device_id TEXT, created_at TEXT NOT NULL DEFAULT '', " +
            "cached_at TEXT, last_verified_at TEXT)");
        database.execSQL("CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL)");
        database.execSQL("CREATE TABLE attachments (" +
            "id TEXT PRIMARY KEY, original_name TEXT, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL DEFAULT 0, " +
            "created_at TEXT NOT NULL, storage_key TEXT, cached_at TEXT, pdf_index_status TEXT, " +
            "pdf_indexed_at TEXT, pdf_index_error TEXT, pdf_index_version INTEGER, pdf_index_attempt INTEGER)");
        database.execSQL("CREATE TABLE node_attachments (" +
            "node_id TEXT NOT NULL, attachment_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, " +
            "PRIMARY KEY (node_id, attachment_id, role))");
        database.execSQL("CREATE TABLE pdf_page_text (" +
            "attachment_id TEXT NOT NULL, page INTEGER NOT NULL, text TEXT NOT NULL, page_width REAL, page_height REAL, " +
            "PRIMARY KEY (attachment_id, page))");
        database.execSQL("CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
        database.execSQL("CREATE TABLE node_view_state (node_id TEXT NOT NULL, device_id TEXT NOT NULL, " +
            "scroll_top INTEGER NOT NULL DEFAULT 0, selection_from INTEGER, selection_to INTEGER, " +
            "source TEXT NOT NULL DEFAULT 'user-scroll', updated_at TEXT NOT NULL, PRIMARY KEY (node_id, device_id))");
        database.execSQL("CREATE TABLE sync_object_state (" +
            "object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL, " +
            "current_version_id TEXT, content_hash TEXT NOT NULL, last_modified_by_device_id TEXT NOT NULL, " +
            "updated_at TEXT NOT NULL, deleted_at TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0, " +
            "PRIMARY KEY (object_type, object_id), UNIQUE (state_seq))");
    }

    private void insertNode(String id, String title, String content, String updatedAt) {
        database.execSQL(
            "INSERT INTO nodes (id, kind, title, content, created_at, updated_at) VALUES (?, 'topic', ?, ?, ?, ?)",
            new Object[] { id, title, content, "2026-04-25T08:00:00.000Z", updatedAt }
        );
    }

    private static JSONObject record(String objectType, String objectId, String payloadJson) throws Exception {
        return new JSONObject()
            .put("object_type", objectType)
            .put("object_id", objectId)
            .put("content_hash", "hash-" + objectType)
            .put("deleted_at", JSONObject.NULL)
            .put("payload_json", payloadJson)
            .put("updated_at", "2026-04-25T09:30:00.000Z");
    }
}
