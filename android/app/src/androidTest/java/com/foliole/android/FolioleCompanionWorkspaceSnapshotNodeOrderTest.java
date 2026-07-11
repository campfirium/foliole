package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionWorkspaceSnapshotNodeOrderTest {
    private SQLiteDatabase database;

    @Before
    public void setUp() {
        database = SQLiteDatabase.create(null);
        database.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL DEFAULT 'topic', priority INTEGER, " +
            "desired_retention REAL, enable_short_term INTEGER, sequential_reading_enabled INTEGER, shelved_at TEXT, manual_child_order TEXT, title TEXT NOT NULL, is_title_manual INTEGER NOT NULL DEFAULT 0, " +
            "hide_title_heading INTEGER NOT NULL DEFAULT 0, content TEXT NOT NULL DEFAULT '', body_blob_hash TEXT, " +
            "opening_text TEXT, virtual_filter TEXT, reveal TEXT, anchor_link TEXT, image_regions TEXT, position INTEGER, " +
            "current_version_id TEXT, last_modified_by_device_id TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0, " +
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)");
        database.execSQL("CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL)");
        database.execSQL("CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
        database.execSQL("CREATE TABLE node_reading (node_id TEXT PRIMARY KEY, interval_duration_ms INTEGER NOT NULL DEFAULT 0, " +
            "interval_growth_factor REAL NOT NULL DEFAULT 1, last_handled_at TEXT NOT NULL, next_at TEXT NOT NULL, " +
            "priority REAL NOT NULL DEFAULT 0, repetition_count INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'active')");
        database.execSQL("CREATE TABLE node_reading_device_state (node_id TEXT NOT NULL, device_id TEXT NOT NULL, " +
            "reading_position INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (node_id, device_id))");
        database.execSQL("CREATE TABLE node_review (node_id TEXT PRIMARY KEY, due TEXT NOT NULL, " +
            "last_review_at TEXT, state INTEGER NOT NULL DEFAULT 0, stability REAL NOT NULL DEFAULT 0, " +
            "difficulty REAL NOT NULL DEFAULT 0, elapsed_days INTEGER NOT NULL DEFAULT 0, " +
            "scheduled_days INTEGER NOT NULL DEFAULT 0, reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0)");
        database.execSQL("CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, availability TEXT NOT NULL DEFAULT 'missing')");
        database.execSQL("CREATE TABLE attachments (id TEXT PRIMARY KEY, original_name TEXT, mime_type TEXT NOT NULL)");
        database.execSQL("CREATE TABLE node_attachments (node_id TEXT NOT NULL, attachment_id TEXT NOT NULL, role TEXT NOT NULL, " +
            "PRIMARY KEY (node_id, attachment_id, role))");
        database.execSQL("CREATE TABLE node_view_state (node_id TEXT NOT NULL, device_id TEXT NOT NULL, " +
            "scroll_top INTEGER NOT NULL DEFAULT 0, selection_from INTEGER, selection_to INTEGER, " +
            "source TEXT NOT NULL DEFAULT 'user-scroll', updated_at TEXT NOT NULL, PRIMARY KEY (node_id, device_id))");
        insertNode("article-1", "First article");
        insertNode("article-2", "Second article");
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void exportsNodesWhenSyncedPackHasNoNodeOrderRows() throws Exception {
        JSObject snapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(
            InstrumentationRegistry.getInstrumentation().getTargetContext(),
            database,
            "android-test"
        );

        assertNotNull(snapshot);
        assertEquals(2, snapshot.getJSONArray("nodeOrder").length());
        assertEquals("article-1", snapshot.getJSONArray("nodeOrder").getString(0));
        assertEquals("article-2", snapshot.getJSONArray("nodeOrder").getString(1));
    }

    @Test
    public void exportsPersistedNodeOrderPositionInNodePayload() throws Exception {
        database.execSQL("INSERT INTO node_order (node_id, position) VALUES ('article-1', 37)");

        JSObject snapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(
            InstrumentationRegistry.getInstrumentation().getTargetContext(),
            database,
            "android-test"
        );

        assertNotNull(snapshot);
        assertEquals(37, snapshot.getJSObject("nodesById").getJSObject("article-1").getInteger("position").intValue());
    }

    private void insertNode(String id, String title) {
        database.execSQL(
            "INSERT INTO nodes (id, kind, title, content, created_at, updated_at) VALUES (?, 'topic', ?, ?, ?, ?)",
            new Object[] { id, title, title + " body", "2026-04-25T08:00:00.000Z", "2026-04-25T09:00:00.000Z" }
        );
    }
}
