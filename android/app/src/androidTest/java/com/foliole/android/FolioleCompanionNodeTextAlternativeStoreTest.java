package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSObject;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class FolioleCompanionNodeTextAlternativeStoreTest {
    private SQLiteDatabase database;
    private Context context;

    @Before
    public void setUp() {
        database = SQLiteDatabase.create(null);
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        database.execSQL(
            "CREATE TABLE node_text_alternatives (alternative_id TEXT PRIMARY KEY, node_id TEXT NOT NULL, " +
                "source_version_id TEXT NOT NULL, body_text TEXT NOT NULL, source_device_id TEXT NOT NULL, " +
                "created_at TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL)"
        );
        database.execSQL(
            "CREATE TABLE sync_object_state (object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER UNIQUE NOT NULL, " +
                "current_version_id TEXT, content_hash TEXT NOT NULL, last_modified_by_device_id TEXT NOT NULL, updated_at TEXT NOT NULL, " +
                "deleted_at TEXT, sync_dirty INTEGER NOT NULL, base_content_hash TEXT, PRIMARY KEY (object_type, object_id))"
        );
        database.execSQL(
            "INSERT INTO node_text_alternatives VALUES " +
                "('alternative-1', 'topic-1', 'android#1', 'Other body', 'android-device', " +
                "'2026-07-25T00:00:00.000Z', 'available', '2026-07-25T00:00:00.000Z')"
        );
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void terminalStatusPersistsAndBecomesDirtyForPush() throws Exception {
        JSObject loaded = FolioleCompanionNodeTextAlternativeStore.load(context, database, "topic-1");
        assertEquals("Other body", loaded.getJSObject("alternative").getString("body_text"));

        FolioleCompanionNodeTextAlternativeStore.updateStatus(
            context, database, "alternative-1", "dismissed", "2026-07-25T01:00:00.000Z"
        );

        assertTrue(FolioleCompanionNodeTextAlternativeStore.load(context, database, "topic-1").isNull("alternative"));
        assertEquals("dismissed", selectString("SELECT status FROM node_text_alternatives"));
        assertEquals("1", selectString("SELECT sync_dirty FROM sync_object_state"));
    }

    private String selectString(String sql) {
        try (Cursor cursor = database.rawQuery(sql, null)) {
            if (!cursor.moveToFirst()) throw new AssertionError("missing row");
            return cursor.getString(0);
        }
    }
}
