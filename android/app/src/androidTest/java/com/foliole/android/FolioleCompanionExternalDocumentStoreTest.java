package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

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
public class FolioleCompanionExternalDocumentStoreTest {

    private SQLiteDatabase database;

    @Before
    public void setUp() {
        database = SQLiteDatabase.create(null);
        database.execSQL("CREATE TABLE external_documents (" +
            "document_id TEXT PRIMARY KEY, folder_id TEXT NOT NULL, relative_path TEXT NOT NULL, " +
            "file_name TEXT NOT NULL, extension TEXT NOT NULL, source_size_bytes INTEGER NOT NULL, " +
            "source_modified_at TEXT NOT NULL, source_modified_ms INTEGER NOT NULL, content_hash TEXT NOT NULL, " +
            "title TEXT NOT NULL, opening_text TEXT, content TEXT NOT NULL, indexed_at TEXT NOT NULL, " +
            "is_present INTEGER NOT NULL DEFAULT 1, missing_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
        database.execSQL("CREATE TABLE sync_object_state (" +
            "object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL, " +
            "current_version_id TEXT, content_hash TEXT NOT NULL, last_modified_by_device_id TEXT NOT NULL, " +
            "updated_at TEXT NOT NULL, deleted_at TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0, " +
            "PRIMARY KEY (object_type, object_id), UNIQUE (state_seq))");
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void loadsCachedExternalDocumentAppliedFromSyncObjects() throws Exception {
        FolioleCompanionSyncObjectStore.applySyncObjects(database, new JSONArray()
            .put(record("folder-1:doc.md", "doc.md", "cached external content")), "desktop-1");

        JSObject loaded = FolioleCompanionExternalDocumentStore.loadDocument(database, "folder-1:doc.md");
        JSONObject document = loaded.getJSONObject("document");

        assertEquals("folder-1:doc.md", document.getString("document_id"));
        assertEquals("cached external content", document.getString("content"));
        assertEquals("External Doc", document.getString("title"));
    }

    @Test
    public void searchesCachedExternalDocumentsAppliedFromSyncObjects() throws Exception {
        FolioleCompanionSyncObjectStore.applySyncObjects(database, new JSONArray()
            .put(record("folder-1:alpha.md", "alpha.md", "cached alpha body"))
            .put(record("folder-1:beta.md", "beta.md", "cached beta body")), "desktop-1");

        JSObject loaded = FolioleCompanionExternalDocumentStore.searchDocuments(database, "BETA", 10);
        JSONArray results = loaded.getJSONArray("results");

        assertEquals("BETA", loaded.getString("query"));
        assertEquals(1, results.length());
        assertEquals("folder-1:beta.md", results.getJSONObject(0).getString("document_id"));
        assertEquals("cached beta body", results.getJSONObject(0).getString("excerpt"));
    }

    @Test
    public void ignoresMissingExternalDocuments() throws Exception {
        JSONArray records = new JSONArray()
            .put(record("folder-1:doc.md", "doc.md", "cached external content"));
        FolioleCompanionSyncObjectStore.applySyncObjects(database, records, "desktop-1");
        FolioleCompanionSyncObjectStore.applySyncObjects(database, new JSONArray()
            .put(new JSONObject()
                .put("object_type", "external_document")
                .put("object_id", "folder-1:doc.md")
                .put("content_hash", "deleted-hash")
                .put("deleted_at", "2026-04-26T01:05:00.000Z")
                .put("payload_json", "{}")
                .put("updated_at", "2026-04-26T01:05:00.000Z")), "desktop-1");

        assertTrue(FolioleCompanionExternalDocumentStore.loadDocument(database, "folder-1:doc.md").isNull("document"));
        assertEquals(0, FolioleCompanionExternalDocumentStore.searchDocuments(database, "external", 10)
            .getJSONArray("results").length());
    }

    private static JSONObject record(String objectId, String relativePath, String content) throws Exception {
        return new JSONObject()
            .put("object_type", "external_document")
            .put("object_id", objectId)
            .put("content_hash", "hash-" + objectId)
            .put("deleted_at", JSONObject.NULL)
            .put("payload_json", payload(relativePath, content).toString())
            .put("updated_at", "2026-04-26T01:00:00.000Z");
    }

    private static JSONObject payload(String relativePath, String content) throws Exception {
        return new JSONObject()
            .put("content", content)
            .put("content_hash", "body-hash-" + relativePath)
            .put("extension", "md")
            .put("file_name", relativePath)
            .put("folder_id", "folder-1")
            .put("indexed_at", "2026-04-26T01:00:00.000Z")
            .put("opening_text", content)
            .put("relative_path", relativePath)
            .put("source_modified_at", "2026-04-26T00:00:00.000Z")
            .put("source_modified_ms", 1777)
            .put("source_size_bytes", 88)
            .put("title", "External Doc");
    }
}
