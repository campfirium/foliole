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

    private int countSettings() {
        try (Cursor cursor = database.rawQuery("SELECT COUNT(*) FROM setting_records", null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }
}
