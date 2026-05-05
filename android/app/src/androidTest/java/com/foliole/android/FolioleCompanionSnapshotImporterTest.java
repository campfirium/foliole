package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

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
public class FolioleCompanionSnapshotImporterTest {

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
        database.execSQL("CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL)");
        database.execSQL("CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void importsSnapshotIntoFormalTablesAndExportsItBack() throws Exception {
        FolioleCompanionSnapshotImporter.replaceWorkspaceSnapshot(
            database,
            createWorkspaceSnapshotJson(),
            "2026-04-23T12:00:00.000Z"
        );

        JSObject snapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(database);

        assertNotNull(snapshot);
        assertEquals("article-1", snapshot.getString("activeNodeId"));
        assertEquals("article-1", snapshot.getJSONArray("nodeOrder").getString(0));
        assertEquals("review-1", snapshot.getJSONArray("nodeOrder").getString(1));
        assertEquals(2, snapshot.getJSONArray("nodeOrder").length());
        assertEquals(0, snapshot.getJSONArray("trashedNodeIds").length());

        JSONObject article = snapshot.getJSONObject("nodesById").getJSONObject("article-1");
        assertEquals("Readable article", article.getString("title"));
        assertEquals("Article body", article.getString("content"));
        assertEquals(true, article.getBoolean("hideTitleHeading"));
        assertEquals("active", article.getJSONObject("reading").getString("state"));
        assertEquals(2, article.getJSONObject("reading").getInt("repetitionCount"));

        JSONObject review = snapshot.getJSONObject("nodesById").getJSONObject("review-1").getJSONObject("review");
        assertEquals("2026-04-24T08:00:00.000Z", review.getString("due"));
        assertEquals(3.2, review.getDouble("stability"), 0.001);
        assertEquals(4, review.getInt("reps"));
    }

    @Test
    public void exportsNullWhenSnapshotClearsFormalTables() throws Exception {
        FolioleCompanionSnapshotImporter.replaceWorkspaceSnapshot(
            database,
            createWorkspaceSnapshotJson(),
            "2026-04-23T12:00:00.000Z"
        );

        FolioleCompanionSnapshotImporter.replaceWorkspaceSnapshot(database, "null", "2026-04-23T13:00:00.000Z");

        assertNull(FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(database));
    }

    @Test
    public void singleNodeUpdatesPreserveWorkspaceOrderAndOtherNodes() throws Exception {
        FolioleCompanionSnapshotImporter.replaceWorkspaceSnapshot(
            database,
            createWorkspaceSnapshotJson(),
            "2026-04-23T12:00:00.000Z"
        );

        FolioleCompanionNodeSnapshotWriter.upsertNodeSnapshot(
            database,
            "review-1",
            createUpdatedReviewNode(),
            "2026-04-23T12:30:00.000Z"
        );

        JSObject snapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(database);

        assertNotNull(snapshot);
        assertEquals("article-1", snapshot.getJSONArray("nodeOrder").getString(0));
        assertEquals("review-1", snapshot.getJSONArray("nodeOrder").getString(1));
        assertEquals("Article body", snapshot.getJSONObject("nodesById").getJSONObject("article-1").getString("content"));
        assertEquals(
            "2026-04-30T08:00:00.000Z",
            snapshot.getJSONObject("nodesById").getJSONObject("review-1").getJSONObject("review").getString("due")
        );
        assertNodeSyncState("review-1", 0, null);
    }

    @Test
    public void localSingleNodeUpdatesMarkNodeDirtyForFutureReturnSync() throws Exception {
        FolioleCompanionSnapshotImporter.replaceWorkspaceSnapshot(
            database,
            createWorkspaceSnapshotJson(),
            "2026-04-23T12:00:00.000Z"
        );

        FolioleCompanionNodeSnapshotWriter.upsertNodeSnapshot(
            database,
            "review-1",
            createUpdatedReviewNode(),
            "2026-04-23T12:30:00.000Z",
            true,
            "android-test-device"
        );

        assertNodeSyncState("review-1", 1, "android-test-device");
    }

    @Test
    public void exportsFolderKindWithoutNormalizingItToTopic() throws Exception {
        insertNode("folder-1", null, "folder", "Folder", "");
        insertNode("topic-1", "folder-1", "topic", "Topic", "Readable body");
        database.execSQL("INSERT INTO node_order (node_id, position) VALUES ('folder-1', 0), ('topic-1', 1)");

        JSObject snapshot = FolioleCompanionWorkspaceSnapshotExporter.loadWorkspaceSnapshot(database);

        assertNotNull(snapshot);
        JSONObject nodesById = snapshot.getJSONObject("nodesById");
        assertEquals("folder", nodesById.getJSONObject("folder-1").getString("kind"));
        assertEquals("topic", nodesById.getJSONObject("topic-1").getString("kind"));
        assertEquals("folder-1", nodesById.getJSONObject("topic-1").getString("parentNodeId"));
    }

    private static String createWorkspaceSnapshotJson() throws Exception {
        JSONObject snapshot = new JSONObject();
        snapshot.put("activeNodeId", "article-1");
        snapshot.put("nodeOrder", new JSONArray().put("article-1").put("review-1").put("trashed-1"));
        snapshot.put("trashedNodeIds", new JSONArray().put("trashed-1"));
        snapshot.put("untitledSequenceByParent", new JSONObject());

        JSONObject nodesById = new JSONObject();
        nodesById.put("article-1", createArticleNode());
        nodesById.put("review-1", createReviewNode());
        nodesById.put("trashed-1", createTrashedNode());
        snapshot.put("nodesById", nodesById);
        return snapshot.toString();
    }

    private static JSONObject createArticleNode() throws Exception {
        JSONObject node = createBaseNode("article-1", "Readable article", "Article body");
        node.put("hideTitleHeading", true);
        node.put("reading", new JSONObject()
            .put("intervalDurationMs", 3600000)
            .put("intervalGrowthFactor", 1.5)
            .put("lastHandledAt", "2026-04-22T08:00:00.000Z")
            .put("nextAt", "2026-04-23T08:00:00.000Z")
            .put("priority", 2)
            .put("readingPosition", 12)
            .put("repetitionCount", 2)
            .put("state", "active"));
        return node;
    }

    private static JSONObject createReviewNode() throws Exception {
        JSONObject node = createBaseNode("review-1", "Review card", "Question");
        node.put("reveal", "Answer");
        node.put("review", new JSONObject()
            .put("due", "2026-04-24T08:00:00.000Z")
            .put("lastReviewAt", "2026-04-21T08:00:00.000Z")
            .put("state", 2)
            .put("stability", 3.2)
            .put("difficulty", 4.1)
            .put("elapsedDays", 1)
            .put("scheduledDays", 3)
            .put("reps", 4)
            .put("lapses", 0));
        return node;
    }

    private static JSONObject createUpdatedReviewNode() throws Exception {
        return createReviewNode()
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
            .put("updatedAt", "2026-04-23T12:30:00.000Z");
    }

    private static JSONObject createTrashedNode() throws Exception {
        return createBaseNode("trashed-1", "Deleted", "Deleted content")
            .put("deletedAt", "2026-04-22T09:00:00.000Z");
    }

    private static JSONObject createBaseNode(String id, String title, String content) throws Exception {
        return new JSONObject()
            .put("id", id)
            .put("parentNodeId", JSONObject.NULL)
            .put("kind", "item")
            .put("title", title)
            .put("isTitleManual", false)
            .put("hideTitleHeading", false)
            .put("content", content)
            .put("openingText", JSONObject.NULL)
            .put("reveal", JSONObject.NULL)
            .put("anchorLink", JSONObject.NULL)
            .put("reading", JSONObject.NULL)
            .put("review", JSONObject.NULL)
            .put("createdAt", "2026-04-20T08:00:00.000Z")
            .put("updatedAt", "2026-04-22T08:00:00.000Z");
    }

    private void assertNodeSyncState(String nodeId, int syncDirty, String deviceId) {
        try (Cursor cursor = database.rawQuery(
            "SELECT sync_dirty, last_modified_by_device_id FROM nodes WHERE id = ?",
            new String[] { nodeId }
        )) {
            assertEquals(true, cursor.moveToFirst());
            assertEquals(syncDirty, cursor.getInt(0));
            if (deviceId == null) {
                assertNull(cursor.getString(1));
            } else {
                assertEquals(deviceId, cursor.getString(1));
            }
        }
    }

    private void insertNode(String id, String parentId, String kind, String title, String content) {
        database.execSQL(
            "INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            new Object[] { id, parentId, kind, title, content, "2026-04-23T08:00:00.000Z", "2026-04-23T08:00:00.000Z" }
        );
    }
}
