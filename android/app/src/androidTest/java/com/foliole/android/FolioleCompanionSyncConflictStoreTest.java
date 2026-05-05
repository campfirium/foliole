package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.content.Context;
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

import java.io.File;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncConflictStoreTest {
    private File databaseFile;
    private SQLiteDatabase database;

    @Before
    public void setUp() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        databaseFile = context.getDatabasePath("foliole-conflict-test.db");
        deleteDatabaseFiles();
        databaseFile.getParentFile().mkdirs();
        database = SQLiteDatabase.openOrCreateDatabase(databaseFile, null);
        database.execSQL(
            "CREATE TABLE node_sync_conflicts (" +
                "conflict_version_id TEXT PRIMARY KEY," +
                "object_id TEXT NOT NULL," +
                "parent_version_id TEXT," +
                "device_id TEXT," +
                "content_hash TEXT," +
                "snapshot_json TEXT NOT NULL," +
                "detected_at TEXT NOT NULL" +
                ")"
        );
    }

    @After
    public void tearDown() {
        if (database != null && database.isOpen()) {
            database.close();
        }
        deleteDatabaseFiles();
    }

    @Test
    public void loadsNodeConflictsForCompanionBridge() throws Exception {
        database.execSQL(
            "INSERT INTO node_sync_conflicts " +
                "(conflict_version_id, object_id, parent_version_id, device_id, content_hash, snapshot_json, detected_at) " +
                "VALUES ('phone#1', 'node-1', 'desktop#1', 'phone', 'hash-1', " +
                "'{\"id\":\"node-1\",\"title\":\"Remote\"}', '2026-04-28T01:00:00.000Z')"
        );

        JSObject result = FolioleCompanionSyncConflictStore.loadNodeConflicts(database);
        JSONArray conflicts = result.getJSONArray("conflicts");
        JSONObject conflict = conflicts.getJSONObject(0);

        assertEquals(1, conflicts.length());
        assertEquals("phone#1", conflict.getString("conflict_version_id"));
        assertEquals("node-1", conflict.getString("object_id"));
        assertEquals("Remote", conflict.getJSONObject("snapshot").getString("title"));
    }

    private void deleteDatabaseFiles() {
        if (databaseFile == null) {
            return;
        }
        databaseFile.delete();
        new File(databaseFile.getAbsolutePath() + "-wal").delete();
        new File(databaseFile.getAbsolutePath() + "-shm").delete();
    }
}
