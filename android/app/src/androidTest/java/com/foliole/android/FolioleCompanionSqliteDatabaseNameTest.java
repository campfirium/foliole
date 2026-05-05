package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSArray;
import com.getcapacitor.community.database.sqlite.CapacitorSQLite;
import com.getcapacitor.community.database.sqlite.SQLite.SqliteConfig;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.time.Instant;
import java.util.Hashtable;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSqliteDatabaseNameTest {
    private static final String CAPACITOR_DATABASE_NAME = "foliole-companion";

    private Context context;
    private CapacitorSQLite sqlite;
    private FolioleCompanionDatabaseHelper helper;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.deleteDatabase(FolioleCompanionDatabaseHelper.DATABASE_NAME);
    }

    @After
    public void tearDown() throws Exception {
        if (sqlite != null) {
            sqlite.closeConnection(CAPACITOR_DATABASE_NAME, false);
        }
        if (helper != null) {
            helper.close();
        }
        context.deleteDatabase(FolioleCompanionDatabaseHelper.DATABASE_NAME);
    }

    @Test
    public void javaHelperAndCapacitorSqliteUseSamePhysicalDatabase() throws Exception {
        helper = new FolioleCompanionDatabaseHelper(context);
        SQLiteDatabase database = helper.getWritableDatabase();
        String now = Instant.now().toString();
        database.execSQL(
            "INSERT OR REPLACE INTO setting_records " +
                "(key, scope, platform, form_factor, device_id, value_json, content_hash, updated_at, deleted_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)",
            new Object[] { "sqlite_name_probe", "global", "*", "*", "*", "{\"ok\":true}", "hash", now }
        );
        helper.close();
        helper = null;

        SqliteConfig config = new SqliteConfig();
        config.setIsEncryption(false);
        sqlite = new CapacitorSQLite(context, config);
        sqlite.createConnection(CAPACITOR_DATABASE_NAME, false, "no-encryption", 14, new Hashtable<>(), false);
        sqlite.open(CAPACITOR_DATABASE_NAME, false);

        assertTrue(context.getDatabasePath(FolioleCompanionDatabaseHelper.DATABASE_NAME).exists());
        assertEquals(
            "{\"ok\":true}",
            sqlite.query(
                    CAPACITOR_DATABASE_NAME,
                    "SELECT value_json FROM setting_records WHERE key = ?",
                    jsArray("sqlite_name_probe"),
                    false
                )
                .getJSONObject(0)
                .getString("value_json")
        );
    }

    private static JSArray jsArray(Object value) {
        JSArray values = new JSArray();
        values.put(value);
        return values;
    }
}
