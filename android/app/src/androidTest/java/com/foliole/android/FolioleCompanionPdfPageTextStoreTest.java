package com.foliole.android;

import static org.junit.Assert.assertEquals;

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
public class FolioleCompanionPdfPageTextStoreTest {

    private SQLiteDatabase database;

    @Before
    public void setUp() {
        database = SQLiteDatabase.create(null);
        database.execSQL("CREATE TABLE pdf_page_text (" +
            "attachment_id TEXT NOT NULL, page INTEGER NOT NULL, text TEXT NOT NULL, " +
            "page_width REAL, page_height REAL, PRIMARY KEY (attachment_id, page))");
        database.execSQL("CREATE TABLE sync_object_state (" +
            "object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL, " +
            "current_version_id TEXT, content_hash TEXT NOT NULL, last_modified_by_device_id TEXT NOT NULL, " +
            "updated_at TEXT NOT NULL, deleted_at TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0, base_content_hash TEXT, " +
            "PRIMARY KEY (object_type, object_id), UNIQUE (state_seq))");
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void loadsPdfPageTextAppliedFromSyncObjects() throws Exception {
        JSONArray records = new JSONArray()
            .put(record("pdf-1:2", "{\"attachment_id\":\"pdf-1\",\"page\":2,\"text\":\"second page\",\"page_width\":612,\"page_height\":792}"))
            .put(record("pdf-1:1", "{\"attachment_id\":\"pdf-1\",\"page\":1,\"text\":\"first page\",\"page_width\":612,\"page_height\":792}"));

        FolioleCompanionSyncObjectApplyHarness.applySyncObjects(database, records, "desktop-1");
        JSObject loaded = FolioleCompanionPdfPageTextStore.loadPageText(database, "pdf-1");

        JSONArray pages = loaded.getJSONArray("pages");
        assertEquals("pdf-1", loaded.getString("attachment_id"));
        assertEquals(2, pages.length());
        assertEquals(1, pages.getJSONObject(0).getInt("page"));
        assertEquals("first page", pages.getJSONObject(0).getString("text"));
        assertEquals(2, pages.getJSONObject(1).getInt("page"));
        assertEquals(792.0, pages.getJSONObject(1).getDouble("page_height"), 0.001);
    }

    @Test
    public void searchesPdfPageTextAppliedFromSyncObjects() throws Exception {
        JSONArray records = new JSONArray()
            .put(record("pdf-1:1", "{\"attachment_id\":\"pdf-1\",\"page\":1,\"text\":\"alpha beta gamma\",\"page_width\":612,\"page_height\":792}"))
            .put(record("pdf-2:1", "{\"attachment_id\":\"pdf-2\",\"page\":1,\"text\":\"another beta page\",\"page_width\":612,\"page_height\":792}"))
            .put(record("pdf-3:1", "{\"attachment_id\":\"pdf-3\",\"page\":1,\"text\":\"no match\",\"page_width\":612,\"page_height\":792}"));

        FolioleCompanionSyncObjectApplyHarness.applySyncObjects(database, records, "desktop-1");
        JSObject loaded = FolioleCompanionPdfPageTextStore.searchPageText(database, "BETA", 10);

        JSONArray results = loaded.getJSONArray("results");
        assertEquals("BETA", loaded.getString("query"));
        assertEquals(2, results.length());
        assertEquals("pdf-1", results.getJSONObject(0).getString("attachment_id"));
        assertEquals(1, results.getJSONObject(0).getInt("page"));
        assertEquals(6, results.getJSONObject(0).getInt("match_start"));
        assertEquals("alpha beta gamma", results.getJSONObject(0).getString("excerpt"));
        assertEquals("pdf-2", results.getJSONObject(1).getString("attachment_id"));
    }

    private static JSONObject record(String objectId, String payloadJson) throws Exception {
        return new JSONObject()
            .put("object_type", "pdf_page_text")
            .put("object_id", objectId)
            .put("content_hash", "hash-" + objectId)
            .put("deleted_at", JSONObject.NULL)
            .put("payload_json", payloadJson)
            .put("updated_at", "2026-04-25T09:30:00.000Z");
    }
}
