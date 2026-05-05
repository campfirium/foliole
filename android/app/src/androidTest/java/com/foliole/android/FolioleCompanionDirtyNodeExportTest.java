package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class FolioleCompanionDirtyNodeExportTest {

    private SQLiteDatabase database;

    @Before
    public void setUp() {
        database = SQLiteDatabase.create(null);
        database.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL DEFAULT 'topic', priority INTEGER, " +
            "desired_retention REAL, title TEXT NOT NULL, is_title_manual INTEGER NOT NULL DEFAULT 0, " +
            "hide_title_heading INTEGER NOT NULL DEFAULT 0, content TEXT NOT NULL DEFAULT '', opening_text TEXT, " +
            "virtual_filter TEXT, reveal TEXT, anchor_link TEXT, image_regions TEXT, position INTEGER, " +
            "current_version_id TEXT, last_modified_by_device_id TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0, " +
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)");
        database.execSQL("CREATE TABLE node_review (" +
            "node_id TEXT PRIMARY KEY, due TEXT NOT NULL, last_review_at TEXT, state INTEGER NOT NULL DEFAULT 0, " +
            "stability REAL NOT NULL DEFAULT 0, difficulty REAL NOT NULL DEFAULT 0, elapsed_days INTEGER NOT NULL DEFAULT 0, " +
            "scheduled_days INTEGER NOT NULL DEFAULT 0, reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0)");
        database.execSQL("CREATE TABLE node_reading (" +
            "node_id TEXT PRIMARY KEY, interval_duration_ms INTEGER NOT NULL DEFAULT 0, " +
            "interval_growth_factor REAL NOT NULL DEFAULT 1, last_handled_at TEXT NOT NULL, next_at TEXT NOT NULL, " +
            "priority REAL NOT NULL DEFAULT 0, reading_position INTEGER NOT NULL DEFAULT 0, " +
            "repetition_count INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'active')");
        database.execSQL("CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void exportsDirtyNodesWithDeviceAndBaselineSyncTime() throws Exception {
        FolioleCompanionNodeSnapshotWriter.upsertNodeSnapshot(
            database,
            "review-1",
            createDirtyReviewNode(),
            "2026-04-23T12:30:00.000Z",
            true,
            "android-test-device"
        );
        database.execSQL(
            "INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)",
            new Object[] { "workspace_sync_last_synced_at", "2026-04-23T12:00:00.000Z", "2026-04-23T12:00:00.000Z" }
        );

        JSObject payload = FolioleCompanionDirtyNodeExport.loadDirtyNodes(
            database,
            "android-test-device",
            "2026-04-23T12:00:00.000Z"
        );

        assertEquals("android-test-device", payload.getString("device_id"));
        assertEquals("2026-04-23T12:00:00.000Z", payload.getString("last_synced_at"));
        assertEquals(1, payload.getJSONArray("nodes").length());
        assertEquals("review-1", payload.getJSONArray("nodes").getJSONObject(0).getString("object_id"));
        assertEquals(
            "2026-04-30T08:00:00.000Z",
            payload.getJSONArray("nodes").getJSONObject(0).getJSONObject("snapshot").getJSONObject("review").getString("due")
        );
    }

    private static JSONObject createDirtyReviewNode() throws Exception {
        return new JSONObject()
            .put("id", "review-1")
            .put("parentNodeId", JSONObject.NULL)
            .put("kind", "item")
            .put("title", "Review card")
            .put("isTitleManual", false)
            .put("hideTitleHeading", false)
            .put("content", "Question")
            .put("openingText", JSONObject.NULL)
            .put("reveal", "Answer")
            .put("anchorLink", JSONObject.NULL)
            .put("reading", JSONObject.NULL)
            .put("review", new JSONObject()
                .put("due", "2026-04-30T08:00:00.000Z")
                .put("lastReviewAt", "2026-04-23T12:30:00.000Z")
                .put("state", 2)
                .put("stability", 5.4)
                .put("difficulty", 3.6)
                .put("elapsedDays", 0)
                .put("scheduledDays", 7)
                .put("reps", 5)
                .put("lapses", 0))
            .put("createdAt", "2026-04-20T08:00:00.000Z")
            .put("updatedAt", "2026-04-23T12:30:00.000Z");
    }
}
