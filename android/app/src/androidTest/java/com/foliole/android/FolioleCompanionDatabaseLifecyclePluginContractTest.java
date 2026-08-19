package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSArray;
import com.getcapacitor.community.database.sqlite.CapacitorSQLite;
import com.getcapacitor.community.database.sqlite.SQLite.SqliteConfig;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.Hashtable;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionDatabaseLifecyclePluginContractTest {
    private static final String DATABASE_NAME = "foliole-lifecycle-contract";
    private static final String DATABASE_FILE = DATABASE_NAME + "SQLite.db";
    private static final int CURRENT_VERSION = 26;

    private Context context;
    private CapacitorSQLite sqlite;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.deleteDatabase(DATABASE_FILE);
        SqliteConfig config = new SqliteConfig();
        config.setIsEncryption(false);
        sqlite = new CapacitorSQLite(context, config);
        open();
    }

    @After
    public void tearDown() throws Exception {
        try { sqlite.closeConnection(DATABASE_NAME, false); } catch (Exception ignored) { }
        context.deleteDatabase(DATABASE_FILE);
    }

    @Test
    public void realPluginSupportsSharedLifecycleContractAcrossHistoricalVersions() throws Exception {
        String initialJournal = stringValue(query("PRAGMA journal_mode"), "journal_mode");
        assertTrue(initialJournal.equalsIgnoreCase("delete") || initialJournal.equalsIgnoreCase("wal"));
        sqlite.execute(DATABASE_NAME, "CREATE TABLE lifecycle_probe (value TEXT NOT NULL)", false, false);

        for (int version = 2; version <= CURRENT_VERSION; version += 1) {
            sqlite.execute(DATABASE_NAME, "PRAGMA user_version = " + version, false, false);
            assertEquals(version, intValue(query("PRAGMA user_version"), "user_version"));
        }

        sqlite.beginTransaction(DATABASE_NAME);
        sqlite.run(DATABASE_NAME, "INSERT INTO lifecycle_probe VALUES (?)", values("rolled-back"), false, false, "no");
        sqlite.rollbackTransaction(DATABASE_NAME);
        assertEquals(0, intValue(query("SELECT count(*) AS count FROM lifecycle_probe"), "count"));

        sqlite.beginTransaction(DATABASE_NAME);
        sqlite.run(DATABASE_NAME, "INSERT INTO lifecycle_probe VALUES (?)", values("committed"), false, false, "no");
        sqlite.commitTransaction(DATABASE_NAME);
        assertEquals(1, intValue(query("SELECT count(*) AS count FROM lifecycle_probe"), "count"));
    }

    @Test
    public void realPluginPreservesWalAndCommittedStateAcrossUniqueOwnerClose() throws Exception {
        sqlite.execute(DATABASE_NAME, "CREATE TABLE lifecycle_probe (value TEXT NOT NULL)", false, false);
        assertEquals("wal", stringValue(query("PRAGMA journal_mode = WAL"), "journal_mode").toLowerCase());
        sqlite.run(DATABASE_NAME, "INSERT INTO lifecycle_probe VALUES (?)", values("committed"), false, false, "no");
        assertEquals(0, firstInt(query("PRAGMA wal_checkpoint(FULL)")));

        sqlite.closeConnection(DATABASE_NAME, false);
        open();

        assertEquals("delete", stringValue(query("PRAGMA journal_mode"), "journal_mode").toLowerCase());
        assertEquals("wal", stringValue(query("PRAGMA journal_mode = WAL"), "journal_mode").toLowerCase());
        assertEquals("committed", stringValue(query("SELECT value FROM lifecycle_probe"), "value"));
    }

    private void open() throws Exception {
        sqlite.createConnection(DATABASE_NAME, false, "no-encryption", CURRENT_VERSION, new Hashtable<>(), false);
        sqlite.open(DATABASE_NAME, false);
    }

    private JSArray query(String statement) throws Exception {
        return sqlite.query(DATABASE_NAME, statement, new JSArray(), false);
    }

    private static JSArray values(Object value) {
        JSArray values = new JSArray();
        values.put(value);
        return values;
    }

    private static int firstInt(JSArray rows) throws Exception {
        JSONObject row = rows.getJSONObject(0);
        return row.getInt(row.keys().next());
    }

    private static int intValue(JSArray rows, String key) throws Exception {
        return rows.getJSONObject(0).getInt(key);
    }

    private static String stringValue(JSArray rows, String key) throws Exception {
        return rows.getJSONObject(0).getString(key);
    }
}
