package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class FolioleCompanionNodeRekeyTest {
    private static final String CANONICAL_ID = "highlight-1~canonical";
    private static final String SOURCE_ID = "highlight-1";

    private SQLiteDatabase database;
    private Context context;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        database = SQLiteDatabase.create(null);
        database.setForeignKeyConstraintsEnabled(true);
        FolioleCompanionSchemaInstaller.install(context, database);
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void canonicalAckRekeysNodeGraphAndReplaysIdempotently() throws Exception {
        seedSource(false);

        saveCanonicalAck();
        saveCanonicalAck();

        assertFalse(hasNode(SOURCE_ID));
        assertTrue(hasNode(CANONICAL_ID));
        assertEquals(CANONICAL_ID, selectString("SELECT parent_id FROM nodes WHERE id = 'child-1'"));
        assertEquals(CANONICAL_ID, selectString("SELECT object_id FROM node_sync_versions"));
        assertEquals(CANONICAL_ID, selectSnapshotId());
        assertEquals(CANONICAL_ID, selectString("SELECT node_id FROM node_text_alternatives"));
        assertEquals(CANONICAL_ID, selectString("SELECT object_id FROM sync_object_state"));
        assertEquals(1, selectInt("SELECT COUNT(*) FROM nodes WHERE id = '" + CANONICAL_ID + "'"));
    }

    @Test
    public void canonicalAckRollsBackWhenAnyRekeyMutationConflicts() throws Exception {
        seedSource(true);

        boolean failed = false;
        try {
            saveCanonicalAck();
        } catch (Exception expected) {
            failed = true;
        }

        assertTrue(failed);
        assertTrue(hasNode(SOURCE_ID));
        assertFalse(hasNode(CANONICAL_ID));
        assertEquals(SOURCE_ID, selectString("SELECT parent_id FROM nodes WHERE id = 'child-1'"));
        assertEquals(SOURCE_ID, selectString("SELECT object_id FROM node_sync_versions"));
    }

    private void seedSource(boolean blockCanonicalSyncState) {
        database.execSQL(
            "INSERT INTO nodes (id, parent_id, kind, title, content, anchor_link, current_version_id, created_at, updated_at) " +
                "VALUES (?, NULL, 'topic', 'Highlight', 'Selected text', ?, 'android#1', ?, ?)",
            new Object[] { SOURCE_ID, "{\"id\":\"anchor-1\",\"kind\":\"highlight\"}", now(), now() }
        );
        database.execSQL(
            "INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at) " +
                "VALUES ('child-1', ?, 'topic', 'Child', '', ?, ?)",
            new Object[] { SOURCE_ID, now(), now() }
        );
        database.execSQL(
            "INSERT INTO node_sync_versions " +
                "(version_id, object_id, device_id, created_at, content_hash, body_text, snapshot_json) " +
                "VALUES ('android#1', ?, 'android', ?, 'hash-1', 'Selected text', ?)",
            new Object[] { SOURCE_ID, now(), "{\"id\":\"" + SOURCE_ID + "\"}" }
        );
        database.execSQL(
            "INSERT INTO node_text_alternatives VALUES " +
                "('alternative-1', ?, 'android#1', 'Other text', 'android', ?, 'available', ?)",
            new Object[] { SOURCE_ID, now(), now() }
        );
        insertSyncState(SOURCE_ID, 1);
        if (blockCanonicalSyncState) insertSyncState(CANONICAL_ID, 2);
    }

    private void insertSyncState(String objectId, int stateSeq) {
        database.execSQL(
            "INSERT INTO sync_object_state " +
                "(object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty) " +
                "VALUES ('node', ?, ?, 'hash', 'android', ?, 1)",
            new Object[] { objectId, stateSeq, now() }
        );
    }

    private void saveCanonicalAck() throws Exception {
        JSONObject identity = new JSONObject().put("objectType", "node").put("objectId", SOURCE_ID);
        JSONObject ack = new JSONObject()
            .put("canonical_object_id", CANONICAL_ID)
            .put("client_op_id", "node:android#1")
            .put("identity", identity)
            .put("status", "accepted");
        FolioleCompanionSyncPushAckStore.saveAcks(context, database, new JSONArray().put(ack));
    }

    private boolean hasNode(String nodeId) {
        try (Cursor cursor = database.rawQuery("SELECT 1 FROM nodes WHERE id = ?", new String[] { nodeId })) {
            return cursor.moveToFirst();
        }
    }

    private int selectInt(String sql) {
        try (Cursor cursor = database.rawQuery(sql, null)) {
            if (!cursor.moveToFirst()) throw new AssertionError("missing row");
            return cursor.getInt(0);
        }
    }

    private String selectString(String sql) {
        try (Cursor cursor = database.rawQuery(sql, null)) {
            if (!cursor.moveToFirst()) throw new AssertionError("missing row");
            return cursor.getString(0);
        }
    }

    private String selectSnapshotId() throws Exception {
        String snapshotJson = selectString("SELECT snapshot_json FROM node_sync_versions");
        return new JSONObject(snapshotJson).getString("id");
    }

    private String now() {
        return "2026-07-25T00:00:00.000Z";
    }
}
