package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncObjectApplyNullPayloadTest {
    private SQLiteDatabase database;

    @Before
    public void setUp() {
        database = SQLiteDatabase.create(null);
        database.execSQL("CREATE TABLE setting_records (" +
            "key TEXT NOT NULL, scope TEXT NOT NULL, platform TEXT NOT NULL, form_factor TEXT NOT NULL, " +
            "device_id TEXT NOT NULL, value_json TEXT NOT NULL, content_hash TEXT NOT NULL, updated_at TEXT NOT NULL, " +
            "deleted_at TEXT, PRIMARY KEY (key, scope, platform, form_factor, device_id))");
        database.execSQL("CREATE TABLE node_reading (" +
            "node_id TEXT PRIMARY KEY, interval_duration_ms INTEGER NOT NULL, interval_growth_factor REAL NOT NULL, " +
            "last_handled_at TEXT NOT NULL, next_at TEXT NOT NULL, priority REAL NOT NULL, repetition_count INTEGER NOT NULL, state TEXT NOT NULL)");
        database.execSQL("CREATE TABLE node_reading_device_state (" +
            "node_id TEXT NOT NULL, device_id TEXT NOT NULL, reading_position INTEGER NOT NULL, updated_at TEXT NOT NULL, " +
            "PRIMARY KEY (node_id, device_id))");
    }

    @After
    public void tearDown() {
        database.close();
    }

    @Test
    public void deletedSettingWithNullPayloadDoesNotCrashPackApply() throws Exception {
        database.execSQL(
            "INSERT INTO setting_records (key, scope, platform, form_factor, device_id, value_json, content_hash, updated_at) " +
                "VALUES ('app_settings', 'user_space', 'windows', 'desktop', '*', '{}', 'old-hash', '2026-05-03T00:00:00.000Z')"
        );
        JSONObject record = new JSONObject();
        record.put("object_type", "setting");
        record.put("object_id", "user_space:windows:desktop:*:app_settings");
        record.put("content_hash", "delete-hash");
        record.put("payload_json", JSONObject.NULL);
        record.put("updated_at", "2026-05-03T12:00:00.000Z");
        record.put("deleted_at", "2026-05-03T12:00:00.000Z");

        FolioleCompanionSyncObjectApply.applyPayload(database, record);

        assertEquals(0, countSettings());
    }

    @Test
    public void deletedReadingWithNullPayloadDoesNotCrashPackApply() throws Exception {
        database.execSQL(
            "INSERT INTO node_reading (node_id, interval_duration_ms, interval_growth_factor, last_handled_at, next_at, priority, repetition_count, state) " +
                "VALUES ('node-1', 0, 1, '2026-05-03T00:00:00.000Z', '2026-05-03T00:00:00.000Z', 0, 0, 'active')"
        );
        database.execSQL(
            "INSERT INTO node_reading_device_state (node_id, device_id, reading_position, updated_at) " +
                "VALUES ('node-1', 'android-test', 42, '2026-05-03T00:00:00.000Z')"
        );
        JSONObject record = new JSONObject();
        record.put("object_type", "node_reading");
        record.put("object_id", "node-1");
        record.put("content_hash", "delete-hash");
        record.put("payload_json", JSONObject.NULL);
        record.put("updated_at", "2026-05-03T12:00:00.000Z");
        record.put("deleted_at", "2026-05-03T12:00:00.000Z");

        FolioleCompanionSyncObjectApply.applyPayload(database, record);

        assertEquals(0, countRows("node_reading"));
        assertEquals(0, countRows("node_reading_device_state"));
    }

    private int countSettings() {
        return countRows("setting_records");
    }

    private int countRows(String table) {
        try (Cursor cursor = database.rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }
}
