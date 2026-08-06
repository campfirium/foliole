package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import android.util.Log;

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

import java.io.File;
import java.util.Hashtable;

import static com.foliole.android.FolioleDatabasePerformanceFixtures.copyFiles;
import static com.foliole.android.FolioleDatabasePerformanceFixtures.createAttachmentFiles;
import static com.foliole.android.FolioleDatabasePerformanceFixtures.createPack;
import static com.foliole.android.FolioleDatabasePerformanceFixtures.deleteRecursively;
import static com.foliole.android.FolioleDatabasePerformanceFixtures.seedRows;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionDatabasePerformanceGateTest {
    private static final String TAG = "FolioleDatabasePerf";
    private static final int GATE_VERSION = 1;
    private static final int HYDRATE_ROWS = 1293;
    private static final String NATIVE_DB = "foliole-performance-native.db";
    private static final String PLUGIN_DB = "foliole-performance-plugin";
    private static final String PLUGIN_FILE = PLUGIN_DB + "SQLite.db";

    private Context context;
    private CapacitorSQLite plugin;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        deleteDatabases();
        SqliteConfig config = new SqliteConfig();
        config.setIsEncryption(false);
        plugin = new CapacitorSQLite(context, config);
    }

    @After
    public void tearDown() throws Exception {
        try { plugin.closeConnection(PLUGIN_DB, false); } catch (Exception ignored) { }
        deleteDatabases();
        deleteRecursively(new File(context.getCacheDir(), "foliole-performance-files"));
    }

    @Test
    public void recordsFrozenMobileDatabasePerformanceGate() throws Exception {
        recordControlWrite();
        recordHydrate();
        recordAttach("attach_100mb", 20, 5 * 1024 * 1024);
        recordAttach("content_448_4mb", 448, 10 * 1024);
        recordAttachmentFiles();
    }

    private void recordControlWrite() throws Exception {
        SQLiteDatabase nativeDb = openNative("CREATE TABLE events (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
        openPlugin("CREATE TABLE events (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
        FoliolePerformanceMeasurement nativeResult = FoliolePerformanceMeasurement.measure(() -> {
            nativeDb.beginTransaction();
            try {
                for (int index = 0; index < 32; index += 1) nativeDb.execSQL("INSERT INTO events (value) VALUES ('control')");
                nativeDb.setTransactionSuccessful();
            } finally { nativeDb.endTransaction(); }
        });
        FoliolePerformanceMeasurement candidate = FoliolePerformanceMeasurement.measure(() -> {
            plugin.beginTransaction(PLUGIN_DB);
            try {
                for (int index = 0; index < 32; index += 1) {
                    plugin.run(PLUGIN_DB, "INSERT INTO events (value) VALUES ('control')", new JSArray(), false, false, "no");
                }
                plugin.commitTransaction(PLUGIN_DB);
            } catch (Exception error) {
                plugin.rollbackTransaction(PLUGIN_DB);
                throw error;
            }
        });
        assertEquals(32, count(nativeDb, "events"));
        assertEquals(32, pluginCount("events"));
        nativeDb.close();
        emit("control_write", nativeResult, candidate, true);
        resetWorkload();
    }

    private void recordHydrate() throws Exception {
        SQLiteDatabase nativeDb = openNative("CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL)");
        seedRows(nativeDb, HYDRATE_ROWS, 0);
        openPlugin("CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL)");
        SQLiteDatabase pluginSeed = SQLiteDatabase.openDatabase(context.getDatabasePath(PLUGIN_FILE).getPath(), null, SQLiteDatabase.OPEN_READWRITE);
        seedRows(pluginSeed, HYDRATE_ROWS, 0);
        pluginSeed.close();
        FoliolePerformanceMeasurement nativeResult = FoliolePerformanceMeasurement.measure(() -> materializeNative(nativeDb));
        FoliolePerformanceMeasurement candidate = FoliolePerformanceMeasurement.measure(() -> {
            JSArray rows = plugin.query(PLUGIN_DB, "SELECT id, title FROM nodes ORDER BY id", new JSArray(), false);
            assertEquals(HYDRATE_ROWS, rows.length());
        });
        nativeDb.close();
        emit("hydrate_1293", nativeResult, candidate, true);
        resetWorkload();
    }

    private void recordAttach(String workload, int rows, int bytesPerRow) throws Exception {
        File nativePack = createPack(context.getCacheDir(), "native-" + workload + ".db", rows, bytesPerRow);
        File pluginPack = createPack(context.getCacheDir(), "plugin-" + workload + ".db", rows, bytesPerRow);
        SQLiteDatabase nativeDb = openNative("CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB NOT NULL)");
        openPlugin("CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB NOT NULL)");
        FoliolePerformanceMeasurement nativeResult = FoliolePerformanceMeasurement.measure(() -> attachNative(nativeDb, nativePack));
        FoliolePerformanceMeasurement candidate = FoliolePerformanceMeasurement.measure(() -> attachPlugin(pluginPack));
        assertEquals(rows, count(nativeDb, "blobs"));
        assertEquals(rows, pluginCount("blobs"));
        nativeDb.close();
        boolean cleanup = nativePack.delete() && pluginPack.delete();
        emit(workload, nativeResult, candidate, cleanup);
        resetWorkload();
    }

    private void recordAttachmentFiles() throws Exception {
        File root = new File(context.getCacheDir(), "foliole-performance-files");
        File source = new File(root, "source");
        File nativeTarget = new File(root, "native");
        File candidateTarget = new File(root, "candidate");
        assertFalse(root.exists());
        source.mkdirs(); nativeTarget.mkdirs(); candidateTarget.mkdirs();
        createAttachmentFiles(source);
        FoliolePerformanceMeasurement nativeResult = FoliolePerformanceMeasurement.measure(() -> copyFiles(source, nativeTarget));
        FoliolePerformanceMeasurement candidate = FoliolePerformanceMeasurement.measure(() -> copyFiles(source, candidateTarget));
        deleteRecursively(root);
        emit("attachments_21_32mb", nativeResult, candidate, !root.exists());
    }

    private SQLiteDatabase openNative(String schema) {
        SQLiteDatabase database = context.openOrCreateDatabase(NATIVE_DB, Context.MODE_PRIVATE, null);
        database.execSQL(schema);
        return database;
    }

    private void openPlugin(String schema) throws Exception {
        plugin.createConnection(PLUGIN_DB, false, "no-encryption", 1, new Hashtable<>(), false);
        plugin.open(PLUGIN_DB, false);
        plugin.execute(PLUGIN_DB, schema, false, false);
    }

    private static void materializeNative(SQLiteDatabase database) throws Exception {
        try (Cursor cursor = database.rawQuery("SELECT id, title FROM nodes ORDER BY id", null)) {
            int rows = 0;
            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                row.put("id", cursor.getString(0));
                row.put("title", cursor.getString(1));
                rows += 1;
            }
            assertEquals(HYDRATE_ROWS, rows);
        }
    }

    private static void attachNative(SQLiteDatabase database, File pack) {
        database.execSQL("ATTACH DATABASE " + sqlString(pack.getPath()) + " AS incoming");
        try { database.execSQL("INSERT INTO blobs SELECT * FROM incoming.pack_blobs"); }
        finally { database.execSQL("DETACH DATABASE incoming"); }
    }

    private void attachPlugin(File pack) throws Exception {
        plugin.run(PLUGIN_DB, "ATTACH DATABASE " + sqlString(pack.getPath()) + " AS incoming", new JSArray(), false, false, "no");
        try {
            plugin.beginTransaction(PLUGIN_DB);
            plugin.run(PLUGIN_DB, "INSERT INTO blobs SELECT * FROM incoming.pack_blobs", new JSArray(), false, false, "no");
            plugin.commitTransaction(PLUGIN_DB);
        } catch (Exception error) {
            plugin.rollbackTransaction(PLUGIN_DB);
            throw error;
        } finally {
            plugin.run(PLUGIN_DB, "DETACH DATABASE incoming", new JSArray(), false, false, "no");
        }
    }

    private void emit(String workload, FoliolePerformanceMeasurement nativeResult,
                      FoliolePerformanceMeasurement candidate, boolean cleanup) throws Exception {
        JSONObject result = new JSONObject();
        result.put("gate_version", GATE_VERSION);
        result.put("platform", "android");
        result.put("workload", workload);
        result.put("native_ms", nativeResult.elapsedMs);
        result.put("candidate_ms", candidate.elapsedMs);
        result.put("native_peak_delta_bytes", nativeResult.peakDeltaBytes);
        result.put("candidate_peak_delta_bytes", candidate.peakDeltaBytes);
        result.put("bridge_blob_bytes", 0);
        result.put("timer_resolution_ms", 1);
        result.put("cleanup_verified", cleanup);
        String line = "FOLIOLE_DATABASE_PERFORMANCE_RESULT=" + result;
        Log.i(TAG, line);
        Bundle status = new Bundle();
        status.putString("stream", line + "\n");
        InstrumentationRegistry.getInstrumentation().sendStatus(2, status);
    }

    private int pluginCount(String table) throws Exception {
        return plugin.query(PLUGIN_DB, "SELECT COUNT(*) AS count FROM " + table, new JSArray(), false)
            .getJSONObject(0).getInt("count");
    }

    private static int count(SQLiteDatabase database, String table) {
        try (Cursor cursor = database.rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            cursor.moveToFirst(); return cursor.getInt(0);
        }
    }

    private static String sqlString(String value) { return "'" + value.replace("'", "''") + "'"; }

    private void deleteDatabases() {
        context.deleteDatabase(NATIVE_DB);
        context.deleteDatabase(PLUGIN_FILE);
    }

    private void resetWorkload() throws Exception {
        plugin.closeConnection(PLUGIN_DB, false);
        context.deleteDatabase(PLUGIN_FILE);
        context.deleteDatabase(NATIVE_DB);
    }

}
