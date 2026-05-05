package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.getcapacitor.JSObject;

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
            "{\"nextAt\":\"2026-04-25T10:00:00.000Z\",\"lastHandledAt\":\"2026-04-25T09:00:00.000Z\",\"state\":\"active\",\"readingPosition\":32}"
        ));
        FolioleCompanionSyncObjectApply.applyPayload(database, record(
            "node_review",
            "article-1",
            "{\"due\":\"2026-04-26T10:00:00.000Z\",\"lastReviewAt\":\"2026-04-25T09:00:00.000Z\",\"state\":2,\"reps\":4}"
        ));
        FolioleCompanionSyncObjectApply.applyPayload(database, record(
            "view_state",
            "session_resume:android:phone:remote-device:active_node",
            "{\"activeNodeId\":\"article-2\"}"
        ));

        JSObject snapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(database);
        JSObject readable = FolioleCompanionReadableArticleQuery.loadReadableArticle(database);

        assertNotNull(snapshot);
        assertEquals("article-2", snapshot.getString("activeNodeId"));
        JSONObject article = snapshot.getJSONObject("nodesById").getJSONObject("article-1");
        assertEquals(32, article.getJSONObject("reading").getInt("readingPosition"));
        assertEquals("2026-04-26T10:00:00.000Z", article.getJSONObject("review").getString("due"));
        assertEquals("article-2", readable.getJSONObject("readable_article").getString("node_id"));
        assertEquals("Fresh body", readable.getJSONObject("readable_article").getString("content"));
    }

    private void createTables() {
        database.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL DEFAULT 'topic', priority INTEGER, " +
            "desired_retention REAL, title TEXT NOT NULL, is_title_manual INTEGER NOT NULL DEFAULT 0, " +
            "hide_title_heading INTEGER NOT NULL DEFAULT 0, content TEXT NOT NULL DEFAULT '', opening_text TEXT, " +
            "virtual_filter TEXT, reveal TEXT, anchor_link TEXT, image_regions TEXT, position INTEGER, " +
            "current_version_id TEXT, last_modified_by_device_id TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0, " +
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)");
        database.execSQL("CREATE TABLE node_review (node_id TEXT PRIMARY KEY, due TEXT NOT NULL, " +
            "last_review_at TEXT, state INTEGER NOT NULL DEFAULT 0, stability REAL NOT NULL DEFAULT 0, " +
            "difficulty REAL NOT NULL DEFAULT 0, elapsed_days INTEGER NOT NULL DEFAULT 0, " +
            "scheduled_days INTEGER NOT NULL DEFAULT 0, reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0)");
        database.execSQL("CREATE TABLE node_reading (node_id TEXT PRIMARY KEY, interval_duration_ms INTEGER NOT NULL DEFAULT 0, " +
            "interval_growth_factor REAL NOT NULL DEFAULT 1, last_handled_at TEXT NOT NULL, next_at TEXT NOT NULL, " +
            "priority REAL NOT NULL DEFAULT 0, reading_position INTEGER NOT NULL DEFAULT 0, " +
            "repetition_count INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'active')");
        database.execSQL("CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL)");
        database.execSQL("CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
        database.execSQL("CREATE TABLE node_view_state (node_id TEXT PRIMARY KEY, scroll_top INTEGER NOT NULL DEFAULT 0, " +
            "selection_from INTEGER, selection_to INTEGER, updated_at TEXT NOT NULL)");
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
