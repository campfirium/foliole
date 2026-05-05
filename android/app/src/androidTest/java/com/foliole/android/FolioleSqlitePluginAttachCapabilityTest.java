package com.foliole.android;

import static org.junit.Assert.assertEquals;

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

import java.io.File;
import java.util.Hashtable;

@RunWith(AndroidJUnit4.class)
public class FolioleSqlitePluginAttachCapabilityTest {
    private static final String DATABASE_NAME = "foliole-spike-sqlite-capability.db";

    private Context context;
    private CapacitorSQLite sqlite;
    private File packFile;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.deleteDatabase(DATABASE_NAME);
        packFile = new File(context.getCacheDir(), "sqlite-plugin-attach-pack.db");
        deletePackFile();
        createIncomingPack();
        SqliteConfig config = new SqliteConfig();
        config.setIsEncryption(false);
        sqlite = new CapacitorSQLite(context, config);
        sqlite.createConnection(DATABASE_NAME, false, "no-encryption", 1, new Hashtable<>(), false);
        sqlite.open(DATABASE_NAME, false);
    }

    @After
    public void tearDown() throws Exception {
        if (sqlite != null) {
            sqlite.closeConnection(DATABASE_NAME, false);
        }
        context.deleteDatabase(DATABASE_NAME);
        deletePackFile();
    }

    @Test
    public void sqlitePluginCanAttachIncomingPackAndInsertAcrossDatabases() throws Exception {
        sqlite.execute(DATABASE_NAME,
            "CREATE TABLE main_nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body BLOB)",
            false,
            false
        );
        sqlite.execute(DATABASE_NAME, "ATTACH DATABASE " + sqlString(packFile.getAbsolutePath()) + " AS incoming", false, false);
        try {
            sqlite.execute(
                DATABASE_NAME,
                "INSERT INTO main_nodes (id, title, body) SELECT id, title, body FROM incoming.pack_nodes",
                true,
                false
            );
        } finally {
            sqlite.execute(DATABASE_NAME, "DETACH DATABASE incoming", false, false);
        }

        assertEquals(
            "Synced body",
            sqlite.query(DATABASE_NAME, "SELECT title FROM main_nodes WHERE id = ?", jsArray("node-1"), false)
                .getJSONObject(0)
                .getString("title")
        );
    }

    private void createIncomingPack() {
        SQLiteDatabase packDatabase = SQLiteDatabase.openOrCreateDatabase(packFile, null);
        try {
            packDatabase.execSQL("CREATE TABLE pack_nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body BLOB)");
            packDatabase.execSQL(
                "INSERT INTO pack_nodes (id, title, body) VALUES (?, ?, ?)",
                new Object[] { "node-1", "Synced body", new byte[] { 1, 2, 3 } }
            );
        } finally {
            packDatabase.close();
        }
    }

    private static JSArray jsArray(Object value) {
        JSArray values = new JSArray();
        values.put(value);
        return values;
    }

    private static String sqlString(String value) {
        return "'" + value.replace("'", "''") + "'";
    }

    private void deletePackFile() {
        if (packFile != null && packFile.exists() && !packFile.delete()) {
            throw new IllegalStateException("Could not delete " + packFile.getAbsolutePath());
        }
    }
}
