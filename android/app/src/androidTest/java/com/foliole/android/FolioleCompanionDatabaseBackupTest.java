package com.foliole.android;

import static org.junit.Assert.assertEquals;
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
public class FolioleCompanionDatabaseBackupTest {
    private Context context;
    private File databaseFile;
    private SQLiteDatabase database;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        databaseFile = context.getDatabasePath("foliole-backup-test.db");
        deleteDatabaseFiles();
        databaseFile.getParentFile().mkdirs();
        database = SQLiteDatabase.openOrCreateDatabase(databaseFile, null);
        database.execSQL("CREATE TABLE sample (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
        database.execSQL("INSERT INTO sample (id, value) VALUES ('row-1', 'before-sync')");
    }

    @After
    public void tearDown() {
        if (database != null && database.isOpen()) {
            database.close();
        }
        deleteDatabaseFiles();
        deleteBackupDirectory();
    }

    @Test
    public void createsPreSyncDatabaseBackupBeforeApplyCanMutateMainDatabase() throws Exception {
        File backup = FolioleCompanionDatabaseBackup.createPreSyncBackup(context, database, "pack");

        database.execSQL("UPDATE sample SET value = 'after-sync' WHERE id = 'row-1'");

        assertTrue(backup.isFile());
        SQLiteDatabase backupDatabase = SQLiteDatabase.openDatabase(
            backup.getAbsolutePath(),
            null,
            SQLiteDatabase.OPEN_READONLY
        );
        try {
            assertEquals("before-sync", selectString(backupDatabase, "SELECT value FROM sample WHERE id = 'row-1'"));
        } finally {
            backupDatabase.close();
        }
        assertEquals("after-sync", selectString(database, "SELECT value FROM sample WHERE id = 'row-1'"));
    }

    private String selectString(SQLiteDatabase targetDatabase, String sql) {
        try (Cursor cursor = targetDatabase.rawQuery(sql, null)) {
            cursor.moveToFirst();
            return cursor.getString(0);
        }
    }

    private void deleteDatabaseFiles() {
        if (databaseFile == null) {
            return;
        }
        databaseFile.delete();
        new File(databaseFile.getAbsolutePath() + "-wal").delete();
        new File(databaseFile.getAbsolutePath() + "-shm").delete();
    }

    private void deleteBackupDirectory() {
        File directory = new File(context.getFilesDir(), "sync-pre-backups");
        File[] files = directory.listFiles();
        if (files != null) {
            for (File file : files) {
                file.delete();
            }
        }
        directory.delete();
    }
}
