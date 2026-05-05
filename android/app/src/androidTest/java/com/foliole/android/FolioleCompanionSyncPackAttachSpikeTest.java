package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncPackAttachSpikeTest {

    private Context context;
    private SQLiteDatabase mainDatabase;
    private File incomingFile;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        mainDatabase = SQLiteDatabase.create(null);
        mainDatabase.execSQL("CREATE TABLE sync_rows (" +
            "id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
        mainDatabase.execSQL("INSERT INTO sync_rows (id, value, updated_at) VALUES " +
            "('existing', 'old', '2026-04-26T00:00:00.000Z'), " +
            "('rollback-anchor', 'keep', '2026-04-26T00:00:00.000Z')");
        incomingFile = new File(context.getCacheDir(), "incoming-pack-'quote'.db");
        deleteIncomingFile();
    }

    @After
    public void tearDown() {
        if (mainDatabase != null && mainDatabase.isOpen()) {
            mainDatabase.close();
        }
        deleteIncomingFile();
    }

    @Test
    public void attachesIncomingDatabaseAndMergesRows() {
        createIncomingDatabase(
            "INSERT INTO sync_rows (id, value, updated_at) VALUES " +
                "('existing', 'fresh', '2026-04-26T01:00:00.000Z'), " +
                "('new-row', 'created', '2026-04-26T01:00:00.000Z')"
        );

        attachIncoming();
        mainDatabase.beginTransaction();
        try {
            mergeIncomingRows();
            mainDatabase.setTransactionSuccessful();
        } finally {
            mainDatabase.endTransaction();
            detachIncoming();
        }

        assertEquals("fresh", selectValue("existing"));
        assertEquals("created", selectValue("new-row"));
        assertTrue(deleteIncomingFile());
        assertFalse(incomingFile.exists());
    }

    @Test
    public void rollsBackCrossDatabaseMergeWhenTransactionFails() {
        createIncomingDatabase(
            "INSERT INTO sync_rows (id, value, updated_at) VALUES " +
                "('new-row', 'created', '2026-04-26T01:00:00.000Z')"
        );

        attachIncoming();
        mainDatabase.beginTransaction();
        try {
            mergeIncomingRows();
            mainDatabase.execSQL("INSERT INTO sync_rows (id, value, updated_at) VALUES " +
                "('rollback-anchor', 'duplicate', '2026-04-26T01:00:00.000Z')");
        } catch (RuntimeException expected) {
            // The duplicate primary key is intentional; the transaction must roll back all prior writes.
        } finally {
            mainDatabase.endTransaction();
            detachIncoming();
        }

        assertEquals(0, countRows("id = 'new-row'"));
        assertEquals("keep", selectValue("rollback-anchor"));
        assertTrue(deleteIncomingFile());
    }

    private void createIncomingDatabase(String insertSql) {
        SQLiteDatabase incomingDatabase = SQLiteDatabase.openOrCreateDatabase(incomingFile, null);
        try {
            incomingDatabase.execSQL("CREATE TABLE sync_rows (" +
                "id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
            incomingDatabase.execSQL(insertSql);
        } finally {
            incomingDatabase.close();
        }
    }

    private void attachIncoming() {
        mainDatabase.execSQL("ATTACH DATABASE " + sqlString(incomingFile.getAbsolutePath()) + " AS inc");
    }

    private void detachIncoming() {
        mainDatabase.execSQL("DETACH DATABASE inc");
    }

    private void mergeIncomingRows() {
        mainDatabase.execSQL(
            "INSERT OR REPLACE INTO main.sync_rows (id, value, updated_at) " +
                "SELECT id, value, updated_at FROM inc.sync_rows"
        );
    }

    private String selectValue(String id) {
        try (Cursor cursor = mainDatabase.rawQuery(
            "SELECT value FROM sync_rows WHERE id = ?",
            new String[] { id }
        )) {
            cursor.moveToFirst();
            return cursor.getString(0);
        }
    }

    private int countRows(String where) {
        try (Cursor cursor = mainDatabase.rawQuery("SELECT COUNT(*) FROM sync_rows WHERE " + where, null)) {
            cursor.moveToFirst();
            return cursor.getInt(0);
        }
    }

    private boolean deleteIncomingFile() {
        return !incomingFile.exists() || incomingFile.delete();
    }

    private static String sqlString(String value) {
        return "'" + value.replace("'", "''") + "'";
    }
}
