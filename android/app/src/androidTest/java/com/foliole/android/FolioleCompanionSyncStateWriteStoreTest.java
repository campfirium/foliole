package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class FolioleCompanionSyncStateWriteStoreTest {
    private Context context;
    private SQLiteDatabase database;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        database = SQLiteDatabase.create(null);
        createTables();
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void savingNodeReviewCreatesDirtyPushableStateAndReviewLog() throws Exception {
        insertExistingReviewState();

        JSObject result = FolioleCompanionSyncStateWriteStore.saveNodeReview(
            context,
            database,
            new JSONObject()
                .put("node_id", "node-1")
                .put("review_json", reviewPayload().toString())
                .put("review_log_json", reviewLogDraft().toString()),
            "android-device-1"
        );

        String nextHash = result.getString("content_hash");
        assertNotEquals("desktop-review-hash", nextHash);
        assertEquals(1, selectInt(
            "SELECT sync_dirty FROM sync_object_state WHERE object_type = 'node_review' AND object_id = 'node-1'"
        ));
        assertEquals("desktop-review-hash", selectString(
            "SELECT base_content_hash FROM sync_object_state WHERE object_type = 'node_review' AND object_id = 'node-1'"
        ));
        assertEquals(1, selectInt("SELECT reps FROM node_review WHERE node_id = 'node-1'"));

        JSObject changes = FolioleCompanionSyncObjectStore.loadSyncStateChanges(context, database, 0, 10);
        JSONObject change = changes.getJSONArray("objects").getJSONObject(0);
        assertEquals("node_review", change.getString("object_type"));
        assertEquals("desktop-review-hash", change.getString("base_content_hash"));

        JSObject reviews = FolioleCompanionSyncReviewLogStore.loadReviewLog(context, database, null, 10, "android-device-1");
        JSONObject review = reviews.getJSONArray("reviews").getJSONObject(0);
        assertEquals(result.getString("op_id"), review.getString("op_id"));
        assertEquals("node-1", review.getString("node_id"));
    }

    @Test
    public void dirtyStateChangesWaitWhilePushAckExists() throws Exception {
        insertExistingReviewState();
        FolioleCompanionSyncStateWriteStore.saveNodeReview(
            context,
            database,
            new JSONObject()
                .put("node_id", "node-1")
                .put("review_json", reviewPayload().toString()),
            "android-device-1"
        );
        saveAck("node_review:node-1:4", "node_review", "node-1", "accepted", 8);

        JSObject changes = FolioleCompanionSyncObjectStore.loadSyncStateChanges(context, database, 0, 10);

        assertEquals(0, changes.getJSONArray("objects").length());
    }

    @Test
    public void dirtyStateChangesWaitWhilePushIssueExists() throws Exception {
        insertExistingReviewState();
        FolioleCompanionSyncStateWriteStore.saveNodeReview(
            context,
            database,
            new JSONObject()
                .put("node_id", "node-1")
                .put("review_json", reviewPayload().toString()),
            "android-device-1"
        );
        saveAck("node_review:node-1:4", "node_review", "node-1", "conflict", null);

        JSObject changes = FolioleCompanionSyncObjectStore.loadSyncStateChanges(context, database, 0, 10);

        assertEquals(0, changes.getJSONArray("objects").length());
    }

    @Test
    public void localRewriteClearsOldPushIssueAndExportsDirtyStateAgain() throws Exception {
        insertExistingReviewState();
        FolioleCompanionSyncStateWriteStore.saveNodeReview(
            context,
            database,
            new JSONObject()
                .put("node_id", "node-1")
                .put("review_json", reviewPayload().toString()),
            "android-device-1"
        );
        saveAck("node_review:node-1:4", "node_review", "node-1", "conflict", null);

        FolioleCompanionSyncStateWriteStore.saveNodeReview(
            context,
            database,
            new JSONObject()
                .put("node_id", "node-1")
                .put("review_json", reviewPayload().put("reps", 2).toString()),
            "android-device-1"
        );

        JSObject changes = FolioleCompanionSyncObjectStore.loadSyncStateChanges(context, database, 0, 10);
        assertEquals(0, selectInt("SELECT COUNT(*) FROM sync_push_ack"));
        assertEquals(1, changes.getJSONArray("objects").length());
    }

    @Test
    public void pushAckStoreRequiresConfirmableStateSeq() throws Exception {
        JSONArray acks = new JSONArray()
            .put(new JSONObject()
                .put("client_op_id", "node_review:node-1:4")
                .put("identity", new JSONObject()
                    .put("objectType", "node_review")
                    .put("objectId", "node-1"))
                .put("status", "accepted"))
            .put(new JSONObject()
                .put("client_op_id", "node_review:node-1:5")
                .put("identity", new JSONObject()
                    .put("objectType", "node_review")
                    .put("objectId", "node-1"))
                .put("state_seq", 7)
                .put("status", "accepted"))
            .put(new JSONObject()
                .put("client_op_id", "node_review:node-2:6")
                .put("identity", new JSONObject()
                    .put("objectType", "node_review")
                    .put("objectId", "node-2"))
                .put("status", "conflict"))
            .put(new JSONObject()
                .put("client_op_id", "review_log:op-1")
                .put("identity", new JSONObject()
                    .put("objectType", "review_log")
                    .put("objectId", "op-1"))
                .put("status", "accepted"));

        JSObject result = FolioleCompanionSyncPushAckStore.saveAcks(database, acks);

        assertEquals(2, result.getJSONArray("saved_client_op_ids").length());
        assertEquals("node_review:node-1:5", result.getJSONArray("saved_client_op_ids").getString(0));
        assertEquals("node_review:node-2:6", result.getJSONArray("saved_client_op_ids").getString(1));
        assertEquals(2, selectInt("SELECT COUNT(*) FROM sync_push_ack"));
        assertEquals(7, selectInt("SELECT state_seq FROM sync_push_ack WHERE client_op_id = 'node_review:node-1:5'"));
        assertEquals("conflict", selectString("SELECT status FROM sync_push_ack WHERE client_op_id = 'node_review:node-2:6'"));
    }

    @Test
    public void pushAckStoreClearsOldIssueWhenStateAckIsAccepted() throws Exception {
        FolioleCompanionSyncPushAckStore.saveAcks(database, new JSONArray()
            .put(new JSONObject()
                .put("client_op_id", "node_review:node-1:4")
                .put("identity", new JSONObject()
                    .put("objectType", "node_review")
                    .put("objectId", "node-1"))
                .put("status", "conflict")));

        JSObject result = FolioleCompanionSyncPushAckStore.saveAcks(database, new JSONArray()
            .put(new JSONObject()
                .put("client_op_id", "node_review:node-1:5")
                .put("identity", new JSONObject()
                    .put("objectType", "node_review")
                    .put("objectId", "node-1"))
                .put("state_seq", 8)
                .put("status", "accepted")));

        assertEquals(1, result.getJSONArray("saved_client_op_ids").length());
        assertEquals(1, selectInt("SELECT COUNT(*) FROM sync_push_ack"));
        assertEquals("accepted", selectString("SELECT status FROM sync_push_ack WHERE object_type = 'node_review' AND object_id = 'node-1'"));
        assertEquals(8, selectInt("SELECT state_seq FROM sync_push_ack WHERE object_type = 'node_review' AND object_id = 'node-1'"));
    }

    private void saveAck(String clientOpId, String objectType, String objectId, String status, Integer stateSeq) throws Exception {
        JSONObject ack = new JSONObject()
            .put("client_op_id", clientOpId)
            .put("identity", new JSONObject()
                .put("objectType", objectType)
                .put("objectId", objectId))
            .put("status", status);
        if (stateSeq != null) {
            ack.put("state_seq", stateSeq);
        }
        FolioleCompanionSyncPushAckStore.saveAcks(database, new JSONArray().put(ack));
    }

    private void createTables() {
        database.execSQL("CREATE TABLE node_review (" +
            "node_id TEXT PRIMARY KEY, due TEXT NOT NULL, last_review_at TEXT, state INTEGER NOT NULL DEFAULT 0, " +
            "stability REAL NOT NULL DEFAULT 0, difficulty REAL NOT NULL DEFAULT 0, elapsed_days INTEGER NOT NULL DEFAULT 0, " +
            "scheduled_days INTEGER NOT NULL DEFAULT 0, reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0)");
        database.execSQL("CREATE TABLE review_log (" +
            "id TEXT PRIMARY KEY, op_id TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL, node_id TEXT NOT NULL, " +
            "grade INTEGER NOT NULL, scheduler_version TEXT NOT NULL, reviewed_at TEXT NOT NULL, " +
            "due_before TEXT NOT NULL, stability_before REAL NOT NULL, difficulty_before REAL NOT NULL, " +
            "due_after TEXT NOT NULL, stability_after REAL NOT NULL, difficulty_after REAL NOT NULL)");
        database.execSQL("CREATE TABLE sync_object_state (" +
            "object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL, " +
            "current_version_id TEXT, content_hash TEXT NOT NULL, last_modified_by_device_id TEXT NOT NULL, " +
            "updated_at TEXT NOT NULL, deleted_at TEXT, sync_dirty INTEGER NOT NULL DEFAULT 0, base_content_hash TEXT, " +
            "PRIMARY KEY (object_type, object_id), UNIQUE (state_seq))");
        database.execSQL("CREATE TABLE sync_push_ack (" +
            "client_op_id TEXT PRIMARY KEY NOT NULL, object_type TEXT NOT NULL, object_id TEXT NOT NULL, " +
            "state_seq INTEGER, status TEXT NOT NULL, acked_at TEXT NOT NULL)");
    }

    private void insertExistingReviewState() {
        database.execSQL("INSERT INTO node_review (" +
            "node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses) " +
            "VALUES ('node-1', '2026-04-27T00:00:00.000Z', NULL, 0, 1.0, 2.0, 0, 1, 0, 0)");
        database.execSQL("INSERT INTO sync_object_state (" +
            "object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty) " +
            "VALUES ('node_review', 'node-1', 3, 'desktop-review-hash', 'desktop', '2026-04-27T00:00:00.000Z', 0)");
    }

    private static JSONObject reviewPayload() throws Exception {
        return new JSONObject()
            .put("due", "2026-04-28T00:00:00.000Z")
            .put("last_review_at", "2026-04-27T00:05:00.000Z")
            .put("state", 1)
            .put("stability", 3.0)
            .put("difficulty", 4.0)
            .put("elapsed_days", 1)
            .put("scheduled_days", 2)
            .put("reps", 1)
            .put("lapses", 0);
    }

    private static JSONObject reviewLogDraft() throws Exception {
        return new JSONObject()
            .put("grade", 3)
            .put("schedulerVersion", "ts-fsrs@4")
            .put("reviewedAt", "2026-04-27T00:05:00.000Z")
            .put("cardBefore", new JSONObject()
                .put("due", "2026-04-27T00:00:00.000Z")
                .put("stability", 1.0)
                .put("difficulty", 2.0))
            .put("cardAfter", new JSONObject()
                .put("due", "2026-04-28T00:00:00.000Z")
                .put("stability", 3.0)
                .put("difficulty", 4.0));
    }

    private String selectString(String sql) {
        try (Cursor cursor = database.rawQuery(sql, null)) {
            cursor.moveToFirst();
            return cursor.getString(0);
        }
    }

    private int selectInt(String sql) {
        try (Cursor cursor = database.rawQuery(sql, null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }
}
