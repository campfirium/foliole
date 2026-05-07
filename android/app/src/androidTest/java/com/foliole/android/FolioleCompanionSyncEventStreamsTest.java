package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncEventStreamsTest {

    private SQLiteDatabase database;

    @Before
    public void setUp() {
        database = SQLiteDatabase.create(null);
        createTables();
        insertNode("node-1", "desktop#2", "local body");
        insertVersion("desktop#1", null, "node-1", "desktop", "hash-1");
        insertVersion("desktop#2", "desktop#1", "node-1", "desktop", "hash-2");
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void appliesReviewLogByOpIdOnce() throws Exception {
        JSONArray reviews = new JSONArray()
            .put(review("op-1", "desktop"))
            .put(review("op-1", "desktop"));

        JSObject applied = FolioleCompanionSyncReviewLogApplyHarness.applyReviewLog(database, reviews);

        assertEquals(1, applied.getJSONArray("applied_op_ids").length());
        assertEquals(1, countRows("review_log", "op_id = 'op-1'"));
    }

    @Test
    public void exportsLocalReviewLogWithDeviceId() throws Exception {
        FolioleCompanionSyncReviewLogStore.saveLocalReviewLog(InstrumentationRegistry.getInstrumentation().getTargetContext(), database, "node-1", reviewDraft(), "android-device-1");

        JSObject loaded = FolioleCompanionSyncReviewLogStore.loadReviewLog(
            InstrumentationRegistry.getInstrumentation().getTargetContext(),
            database,
            null,
            10,
            "android-device-1"
        );
        JSONObject review = loaded.getJSONArray("reviews").getJSONObject(0);

        assertEquals("android-device-1", review.getString("device_id"));
        assertEquals("node-1", review.getString("node_id"));
    }

    @Test
    public void recordsConflictInsteadOfOverwritingLocalNodeVersion() throws Exception {
        JSONArray nodes = new JSONArray().put(new JSONObject()
            .put("version_id", "phone#1")
            .put("object_id", "node-1")
            .put("object_type", "node")
            .put("parent_version_id", "desktop#1")
            .put("device_id", "phone")
            .put("version_created_at", "2026-04-26T01:00:00.000Z")
            .put("updated_at", "2026-04-26T01:00:00.000Z")
            .put("content_hash", "hash-phone")
            .put("snapshot", nodeSnapshot("remote body"))
            .put("ancestor_version_ids", new JSONArray().put("desktop#1")));

        JSObject applied = FolioleCompanionSyncNodeVersionApplyHarness.applyNodeVersions(database, nodes, "android-test");
        FolioleCompanionSyncNodeVersionApplyHarness.applyNodeVersions(database, nodes, "android-test");

        assertEquals(0, applied.getJSONArray("applied_node_ids").length());
        assertEquals("local body", selectString("nodes", "content", "id = 'node-1'"));
        assertEquals(1, countRows("node_sync_conflicts", "conflict_version_id = 'phone#1'"));
        assertEquals(1, countRows("node_sync_versions", "version_id = 'phone#1'"));
        String copyNodeId = selectString("nodes", "id", "id LIKE 'conflict-copy-%'");
        assertEquals(1, countRows("nodes", "id LIKE 'conflict-copy-%'"));
        assertEquals("special-inbox", selectString("nodes", "parent_id", "id = '" + copyNodeId + "'"));
        assertEquals("remote body", selectString("nodes", "content", "id = '" + copyNodeId + "'"));
        assertEquals(1, countRows("node_order", "node_id = '" + copyNodeId + "' AND position = 0"));
        assertEquals(1, countRows("node_sync_versions", "object_id = '" + copyNodeId + "' AND device_id = 'android-test'"));
        assertEquals(0, FolioleCompanionSyncNodeVersionStore.loadNodeVersions(InstrumentationRegistry.getInstrumentation().getTargetContext(), database, null, 10, "android-test").getJSONArray("nodes").length());
        database.delete("nodes", "id = ?", new String[] { copyNodeId });
        FolioleCompanionSyncNodeVersionApplyHarness.applyNodeVersions(database, nodes, "android-test");
        assertEquals(0, countRows("nodes", "id = '" + copyNodeId + "'"));
    }

    @Test
    public void doesNotStackConflictCopyTitleSuffixes() throws Exception {
        JSONObject snapshot = nodeSnapshot("remote body")
            .put("title", "Remote Node (conflict copy - Android) (conflict copy - Android)");
        JSONArray nodes = new JSONArray().put(new JSONObject()
            .put("version_id", "phone#2")
            .put("object_id", "node-1")
            .put("object_type", "node")
            .put("parent_version_id", "desktop#1")
            .put("device_id", "phone")
            .put("version_created_at", "2026-04-26T01:00:00.000Z")
            .put("updated_at", "2026-04-26T01:00:00.000Z")
            .put("content_hash", "hash-phone-2")
            .put("snapshot", snapshot)
            .put("ancestor_version_ids", new JSONArray().put("desktop#1")));

        FolioleCompanionSyncNodeVersionApplyHarness.applyNodeVersions(database, nodes, "android-test");

        String copyNodeId = selectString("nodes", "id", "id LIKE 'conflict-copy-%'");
        assertEquals("Remote Node (conflict copy - Android)", selectString("nodes", "title", "id = '" + copyNodeId + "'"));
    }

    @Test
    public void updatesOneConflictCopyToLatestSourceBranchHead() throws Exception {
        JSONObject first = remoteNodeRecord("phone#1", "desktop#1", "remote body", "2026-04-26T01:00:00.000Z");
        JSONObject latest = remoteNodeRecord("phone#2", "phone#1", "remote body latest", "2026-04-26T02:00:00.000Z")
            .put("ancestor_version_ids", new JSONArray().put("phone#1").put("desktop#1"));
        JSONArray nodes = new JSONArray().put(first).put(latest);

        FolioleCompanionSyncNodeVersionApplyHarness.applyNodeVersions(database, nodes, "android-test");
        FolioleCompanionSyncNodeVersionApplyHarness.applyNodeVersions(database, new JSONArray().put(first), "android-test");

        String copyNodeId = selectString("nodes", "id", "id LIKE 'conflict-copy-%'");
        assertEquals(1, countRows("nodes", "id LIKE 'conflict-copy-%'"));
        assertEquals("remote body latest", selectString("nodes", "content", "id = '" + copyNodeId + "'"));
        assertEquals(1, countRows("node_sync_conflicts", "object_id = 'node-1' AND device_id = 'phone'"));
    }

    @Test
    public void ignoresIncomingConflictCopyNodes() throws Exception {
        JSONObject record = remoteNodeRecord("phone#copy-1", null, "remote body", "2026-04-26T01:00:00.000Z");
        record.put("object_id", "conflict-copy-source");
        record.getJSONObject("snapshot")
            .put("id", "conflict-copy-source")
            .put("title", "Remote Node (conflict copy - Android)");

        FolioleCompanionSyncNodeVersionApplyHarness.applyNodeVersions(database, new JSONArray().put(record), "android-test");

        assertEquals(0, countRows("nodes", "id LIKE 'conflict-copy-%'"));
        assertEquals(0, countRows("node_sync_conflicts", "1 = 1"));
    }

    @Test
    public void doesNotReviveDeletedLocalNodeFromOldActiveHead() throws Exception {
        database.execSQL(
            "UPDATE nodes SET deleted_at = ?, updated_at = ?, sync_dirty = 0, current_version_id = ? WHERE id = ?",
            new Object[] { "2026-04-26T02:00:00.000Z", "2026-04-26T02:00:00.000Z", "desktop#deleted", "node-1" }
        );
        insertVersion("desktop#deleted", "desktop#2", "node-1", "android-test", "hash-deleted");

        JSONObject record = remoteNodeRecord("phone#old", "desktop#2", "remote active body", "2026-04-26T03:00:00.000Z")
            .put("ancestor_version_ids", new JSONArray().put("desktop#2").put("desktop#1"));
        JSObject applied = FolioleCompanionSyncNodeVersionApplyHarness.applyNodeVersions(
            database,
            new JSONArray().put(record),
            "android-test"
        );

        assertEquals(0, applied.getJSONArray("applied_node_ids").length());
        assertEquals("local body", selectString("nodes", "content", "id = 'node-1'"));
        assertEquals("2026-04-26T02:00:00.000Z", selectString("nodes", "deleted_at", "id = 'node-1'"));
        assertEquals(0, countRows("node_sync_conflicts", "conflict_version_id = 'phone#old'"));
    }

    private void createTables() {
        database.execSQL("CREATE TABLE nodes (" +
            "id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL DEFAULT 'topic', priority INTEGER, " +
            "desired_retention REAL, title TEXT NOT NULL, is_title_manual INTEGER NOT NULL DEFAULT 0, " +
            "hide_title_heading INTEGER NOT NULL DEFAULT 0, content TEXT NOT NULL DEFAULT '', body_blob_hash TEXT, opening_text TEXT, " +
            "virtual_filter TEXT, reveal TEXT, anchor_link TEXT, image_regions TEXT, position INTEGER, " +
            "current_version_id TEXT, last_modified_by_device_id TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0, " +
            "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)");
        database.execSQL("CREATE TABLE review_log (" +
            "id TEXT PRIMARY KEY, op_id TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL, node_id TEXT NOT NULL, " +
            "grade INTEGER NOT NULL, scheduler_version TEXT NOT NULL, reviewed_at TEXT NOT NULL, " +
            "due_before TEXT NOT NULL, stability_before REAL NOT NULL, difficulty_before REAL NOT NULL, " +
            "due_after TEXT NOT NULL, stability_after REAL NOT NULL, difficulty_after REAL NOT NULL)");
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
        database.execSQL("CREATE TABLE companion_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
    }

    private void insertNode(String nodeId, String currentVersionId, String content) {
        database.execSQL(
            "INSERT INTO nodes (id, kind, title, content, current_version_id, created_at, updated_at) " +
                "VALUES (?, 'item', ?, ?, ?, ?, ?)",
            new Object[] { nodeId, "Node", content, currentVersionId, "2026-04-26T00:00:00.000Z", "2026-04-26T00:00:00.000Z" }
        );
    }

    private void insertVersion(String versionId, String parentVersionId, String nodeId, String deviceId, String hash) {
        database.execSQL(
            "INSERT INTO node_sync_versions (version_id, object_id, parent_version_id, device_id, created_at, content_hash) " +
                "VALUES (?, ?, ?, ?, ?, ?)",
            new Object[] { versionId, nodeId, parentVersionId, deviceId, "2026-04-26T00:00:00.000Z", hash }
        );
    }

    private static JSONObject nodeSnapshot(String content) throws Exception {
        return new JSONObject()
            .put("id", "node-1")
            .put("kind", "item")
            .put("title", "Remote Node")
            .put("content", content)
            .put("body_blob_hash", "blob-remote")
            .put("created_at", "2026-04-26T00:00:00.000Z")
            .put("updated_at", "2026-04-26T01:00:00.000Z");
    }

    private static JSONObject remoteNodeRecord(
        String versionId,
        String parentVersionId,
        String content,
        String createdAt
    ) throws Exception {
        return new JSONObject()
            .put("version_id", versionId)
            .put("object_id", "node-1")
            .put("object_type", "node")
            .put("parent_version_id", parentVersionId == null ? JSONObject.NULL : parentVersionId)
            .put("device_id", "phone")
            .put("version_created_at", createdAt)
            .put("updated_at", createdAt)
            .put("content_hash", "hash-" + versionId)
            .put("snapshot", nodeSnapshot(content).put("updated_at", createdAt))
            .put("ancestor_version_ids", new JSONArray().put("desktop#1"));
    }

    private static JSONObject review(String opId, String deviceId) throws Exception {
        return new JSONObject()
            .put("id", "log-" + opId)
            .put("op_id", opId)
            .put("device_id", deviceId)
            .put("node_id", "node-1")
            .put("grade", 3)
            .put("scheduler_version", "ts-fsrs@4")
            .put("reviewed_at", "2026-04-26T01:00:00.000Z")
            .put("due_before", "2026-04-26T00:00:00.000Z")
            .put("stability_before", 1.0)
            .put("difficulty_before", 2.0)
            .put("due_after", "2026-04-27T00:00:00.000Z")
            .put("stability_after", 3.0)
            .put("difficulty_after", 4.0);
    }

    private static JSONObject reviewDraft() throws Exception {
        return new JSONObject()
            .put("grade", 3)
            .put("schedulerVersion", "ts-fsrs@4")
            .put("reviewedAt", "2026-04-26T01:00:00.000Z")
            .put("cardBefore", new JSONObject()
                .put("due", "2026-04-26T00:00:00.000Z")
                .put("stability", 1.0)
                .put("difficulty", 2.0))
            .put("cardAfter", new JSONObject()
                .put("due", "2026-04-27T00:00:00.000Z")
                .put("stability", 3.0)
                .put("difficulty", 4.0));
    }

    private int countRows(String table, String where) {
        try (Cursor cursor = database.rawQuery("SELECT COUNT(*) FROM " + table + " WHERE " + where, null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    private String selectString(String table, String column, String where) {
        try (Cursor cursor = database.rawQuery("SELECT " + column + " FROM " + table + " WHERE " + where, null)) {
            cursor.moveToFirst();
            return cursor.getString(0);
        }
    }
}
