package com.foliole.android;

import static org.junit.Assert.assertEquals;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.SystemClock;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.community.database.sqlite.CapacitorSQLite;
import com.getcapacitor.community.database.sqlite.SQLite.SqliteConfig;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.util.Hashtable;

@RunWith(AndroidJUnit4.class)
public class FolioleSqlitePluginAttachPerformanceTest {
    private static final String TAG = "FolioleSqlitePerf";
    private static final String JAVA_DATABASE_NAME = "foliole-spike-java-perf.db";
    private static final String PLUGIN_DATABASE_NAME = "foliole-spike-plugin-perf.db";
    private static final int ROW_COUNT = 20;
    private static final int BODY_BYTES = 5 * 1024 * 1024;

    private Context context;
    private File javaPackFile;
    private File pluginPackFile;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.deleteDatabase(JAVA_DATABASE_NAME);
        context.deleteDatabase(PLUGIN_DATABASE_NAME);
        javaPackFile = new File(context.getCacheDir(), "sqlite-java-perf-pack.db");
        pluginPackFile = new File(context.getCacheDir(), "sqlite-plugin-perf-pack.db");
        deletePackFiles();
        createIncomingPack(javaPackFile);
        createIncomingPack(pluginPackFile);
    }

    @After
    public void tearDown() {
        context.deleteDatabase(JAVA_DATABASE_NAME);
        context.deleteDatabase(PLUGIN_DATABASE_NAME);
        deletePackFiles();
    }

    @Test
    public void compareFrameworkSqliteAndCapacitorPluginAttachInsert() throws Exception {
        long pluginMs = runCapacitorPlugin();
        long javaMs = runFrameworkSqlite();

        Log.i(TAG, "order=plugin-then-java rows=" + ROW_COUNT + " bodyBytes=" + BODY_BYTES + " pluginMs=" + pluginMs + " javaMs=" + javaMs);
    }

    private long runFrameworkSqlite() {
        SQLiteDatabase database = context.openOrCreateDatabase(JAVA_DATABASE_NAME, Context.MODE_PRIVATE, null);
        try {
            long startedAt = SystemClock.elapsedRealtime();
            database.execSQL("CREATE TABLE main_nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body BLOB)");
            database.execSQL("ATTACH DATABASE " + sqlString(javaPackFile.getAbsolutePath()) + " AS incoming");
            try {
                database.beginTransaction();
                try {
                    database.execSQL("INSERT INTO main_nodes (id, title, body) SELECT id, title, body FROM incoming.pack_nodes");
                    database.setTransactionSuccessful();
                } finally {
                    database.endTransaction();
                }
            } finally {
                database.execSQL("DETACH DATABASE incoming");
            }
            long elapsedMs = SystemClock.elapsedRealtime() - startedAt;
            assertEquals(ROW_COUNT, queryCount(database));
            return elapsedMs;
        } finally {
            database.close();
        }
    }

    private long runCapacitorPlugin() throws Exception {
        SqliteConfig config = new SqliteConfig();
        config.setIsEncryption(false);
        CapacitorSQLite sqlite = new CapacitorSQLite(context, config);
        sqlite.createConnection(PLUGIN_DATABASE_NAME, false, "no-encryption", 1, new Hashtable<>(), false);
        sqlite.open(PLUGIN_DATABASE_NAME, false);
        try {
            long startedAt = SystemClock.elapsedRealtime();
            sqlite.execute(PLUGIN_DATABASE_NAME, "CREATE TABLE main_nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body BLOB)", false, false);
            sqlite.execute(PLUGIN_DATABASE_NAME, "ATTACH DATABASE " + sqlString(pluginPackFile.getAbsolutePath()) + " AS incoming", false, false);
            try {
                sqlite.execute(
                    PLUGIN_DATABASE_NAME,
                    "INSERT INTO main_nodes (id, title, body) SELECT id, title, body FROM incoming.pack_nodes",
                    true,
                    false
                );
            } finally {
                sqlite.execute(PLUGIN_DATABASE_NAME, "DETACH DATABASE incoming", false, false);
            }
            long elapsedMs = SystemClock.elapsedRealtime() - startedAt;
            assertEquals(ROW_COUNT, sqlite.query(PLUGIN_DATABASE_NAME, "SELECT COUNT(*) AS count FROM main_nodes", new com.getcapacitor.JSArray(), false)
                .getJSONObject(0)
                .getInt("count"));
            return elapsedMs;
        } finally {
            sqlite.closeConnection(PLUGIN_DATABASE_NAME, false);
        }
    }

    private void createIncomingPack(File packFile) {
        SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(packFile, null);
        byte[] body = new byte[BODY_BYTES];
        try {
            database.execSQL("CREATE TABLE pack_nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body BLOB)");
            database.beginTransaction();
            try {
                for (int i = 0; i < ROW_COUNT; i++) {
                    database.execSQL(
                        "INSERT INTO pack_nodes (id, title, body) VALUES (?, ?, ?)",
                        new Object[] { "node-" + i, "Title " + i, body }
                    );
                }
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
        } finally {
            database.close();
        }
    }

    private static int queryCount(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery("SELECT COUNT(*) FROM main_nodes", null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    private static String sqlString(String value) {
        return "'" + value.replace("'", "''") + "'";
    }

    private void deletePackFiles() {
        deletePackFile(javaPackFile);
        deletePackFile(pluginPackFile);
    }

    private static void deletePackFile(File packFile) {
        if (packFile != null && packFile.exists() && !packFile.delete()) {
            throw new IllegalStateException("Could not delete " + packFile.getAbsolutePath());
        }
    }
}
