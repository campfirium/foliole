package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
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
public class FolioleCompanionWorkspaceSyncStateTest {
    private Context context;
    private FolioleCompanionDatabaseHelper helper;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.deleteDatabase(FolioleCompanionDatabaseHelper.DATABASE_NAME);
        helper = new FolioleCompanionDatabaseHelper(context);
    }

    @After
    public void tearDown() {
        if (helper != null) {
            helper.close();
        }
        context.deleteDatabase(FolioleCompanionDatabaseHelper.DATABASE_NAME);
    }

    @Test
    public void completedSyncEventPersistsLastSyncedAt() throws Exception {
        insertNode();

        JSObject completed = helper.recordWorkspaceSyncEvent(
            "http://10.0.2.2:38641",
            "completed",
            "Sync fully completed.",
            "2026-05-01T02:00:00.000Z"
        );
        JSObject checked = helper.recordWorkspaceSyncEvent(
            "http://10.0.2.2:38641",
            "skipped",
            "Some topic bodies are still being cached.",
            "2026-05-01T02:01:00.000Z"
        );

        assertEquals("2026-05-01T02:00:00.000Z", completed.getString("last_synced_at"));
        assertEquals("2026-05-01T02:01:00.000Z", checked.getString("last_synced_at"));
        assertFalse(completed.has("workspace_snapshot") && !completed.isNull("workspace_snapshot"));
        assertFalse(checked.has("workspace_snapshot") && !checked.isNull("workspace_snapshot"));
    }

    @Test
    public void runFinishedBlockedEventKeepsRunMetadataWithoutLastSyncedAt() throws Exception {
        JSObject blocked = helper.recordWorkspaceSyncEvent(
            "http://10.0.2.2:38641",
            "skipped",
            "Sync checked; 2 device changes need review before sending.",
            "2026-05-01T02:01:00.000Z",
            "run_finished",
            "blocked",
            "run-1",
            "2026-05-01T02:00:00.000Z"
        );
        JSONArray events = blocked.getJSONArray("sync_events");
        JSONObject event = events.getJSONObject(0);

        assertEquals("run_finished", event.getString("kind"));
        assertEquals("blocked", event.getString("result"));
        assertEquals("run-1", event.getString("run_id"));
        assertFalse(blocked.has("last_synced_at") && !blocked.isNull("last_synced_at"));
    }

    @Test
    public void syncEventHistoryKeepsTwentyFinishedRuns() throws Exception {
        for (int index = 0; index < 21; index += 1) {
            helper.recordWorkspaceSyncEvent("http://10.0.2.2:38641", "started", "Auto sync started.", "2026-05-01T02:00:00.000Z", "run_started", null, "run-" + index, "2026-05-01T02:00:00.000Z");
            helper.recordWorkspaceSyncEvent("http://10.0.2.2:38641", "skipped", "Sync checked; 1 device change needs review before sending.", "2026-05-01T02:00:30.000Z", "run_finished", "blocked", "run-" + index, "2026-05-01T02:00:00.000Z");
        }
        JSObject state = helper.loadWorkspaceSyncState();
        JSONArray events = state.getJSONArray("sync_events");

        assertEquals(40, events.length());
        assertTrue(events.toString().contains("run-20"));
        assertFalse(events.toString().contains("run-0"));
    }

    @Test
    public void syncEventHistoryKeepsStartedRunUntilFinalEventArrives() throws Exception {
        JSObject started = helper.recordWorkspaceSyncEvent(
            "http://10.0.2.2:38641",
            "started",
            "Sync started.",
            "2026-05-01T02:00:00.000Z",
            "run_started",
            null,
            "run-started-only",
            "2026-05-01T02:00:00.000Z"
        );
        JSONArray events = started.getJSONArray("sync_events");

        assertEquals(1, events.length());
        assertEquals("run_started", events.getJSONObject(0).getString("kind"));
        assertEquals("run-started-only", events.getJSONObject(0).getString("run_id"));
    }

    @Test
    public void clearAppDataDisconnectsAndClearsLocalContent() throws Exception {
        helper.saveWorkspaceSyncEndpoint("http://10.0.2.2:38641");
        helper.recordWorkspaceSyncEvent(
            "http://10.0.2.2:38641",
            "completed",
            "Sync fully completed.",
            "2026-05-01T02:00:00.000Z"
        );
        insertNode();

        JSObject cleared = FolioleCompanionAppDataStore.clear(context);

        assertFalse(cleared.has("endpoint_url") && !cleared.isNull("endpoint_url"));
        assertEquals(0, countRows("nodes"));
        assertEquals(0, countRows("sync_object_state"));
        assertEquals(0, countRows("workspace_meta"));
        assertEquals(1, countRows("companion_meta"));
    }

    private void insertNode() {
        SQLiteDatabase database = helper.getWritableDatabase();
        database.execSQL(
            "INSERT INTO nodes (id, kind, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            new Object[] {
                "node-1",
                "item",
                "Local Topic",
                "Local body",
                "2026-05-01T01:00:00.000Z",
                "2026-05-01T01:00:00.000Z"
            }
        );
        database.execSQL(
            "INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty) " +
                "VALUES (?, ?, ?, ?, ?, ?, 0)",
            new Object[] { "node", "node-1", 1, "hash-node", "android-test", "2026-05-01T01:00:00.000Z" }
        );
        database.execSQL(
            "INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)",
            new Object[] { "active_node_id", "node-1", "2026-05-01T01:00:00.000Z" }
        );
    }

    private int countRows(String table) {
        SQLiteDatabase database = helper.getReadableDatabase();
        try (Cursor cursor = database.rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }
}
