package com.foliole.android.framed;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.File;
import java.security.MessageDigest;
import java.util.Arrays;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FramedSyncSQLiteAvailableBodyMigrationTest {
    @Test
    public void preservesLargeBinaryEmptyAndSharedPinsWithOriginalForeignKeys() throws Exception {
        try (SQLiteDatabase database = SQLiteDatabase.create(null)) {
            install(database);
            byte[] body = new byte[3 * 1024 * 1024 + 17];
            for (int index = 0; index < body.length; index++) body[index] = (byte) index;
            byte[] hash = insert(database, body);
            byte[] empty = insert(database, new byte[0]);
            pin(database, hash, body.length, 1, 1, 1);
            pin(database, hash, body.length, 2, 5, 0);
            FramedSyncSQLiteAvailableBodyMigration.migrateChunkedAvailableBodies(database);
            assertEquals(2, database.getVersion());
            assertEquals(2, count(database, "framed_sync_android_blob_pins"));
            assertEquals(7, count(database, "framed_sync_android_available_blob_chunks"));
            assertEquals(0, temporaryTables(database));
            database.beginTransaction();
            try {
                FramedSyncSQLiteChunkedBodies verifier = new FramedSyncSQLiteChunkedBodies(database);
                assertEquals(FramedSyncBodyChunkStream.Result.VERIFIED,
                    verifier.verifyAndPromote(new byte[0], new byte[0], hash, body.length));
                assertEquals(FramedSyncBodyChunkStream.Result.VERIFIED,
                    verifier.verifyAndPromote(new byte[0], new byte[0], empty, 0));
                database.setTransactionSuccessful();
            } finally { database.endTransaction(); }
            try (Cursor chunks = database.rawQuery("SELECT byte_offset, data FROM " +
                "framed_sync_android_available_blob_chunks ORDER BY byte_offset", null)) {
                while (chunks.moveToNext()) {
                    int offset = chunks.getInt(0);
                    assertArrayEquals(Arrays.copyOfRange(body, offset, Math.min(offset + 524288, body.length)), chunks.getBlob(1));
                }
            }
            try {
                database.execSQL("DELETE FROM framed_sync_android_available_blobs");
                fail("pinned body must be protected");
            } catch (android.database.sqlite.SQLiteConstraintException expected) {
                assertEquals(2, count(database, "framed_sync_android_blob_pins"));
            }
            database.execSQL("DELETE FROM framed_sync_android_transfers WHERE transfer_id = ?", new Object[] {new byte[] {1}});
            assertEquals(1, count(database, "framed_sync_android_blob_pins"));
            assertEquals(7, count(database, "framed_sync_android_available_blob_chunks"));
            database.execSQL("DELETE FROM framed_sync_android_transfers");
            database.execSQL("DELETE FROM framed_sync_android_available_blobs");
            assertEquals(0, count(database, "framed_sync_android_available_blob_chunks"));
        }
    }

    @Test
    public void lateBadHashRollsBackAllSourcePinsSchemaAndVersionThenRetries() throws Exception {
        try (SQLiteDatabase database = SQLiteDatabase.create(null)) {
            install(database);
            byte[] first = new byte[524289];
            Arrays.fill(first, (byte) 255);
            byte[] firstHash = insert(database, first);
            byte[] secondHash = insert(database, new byte[] {1, 2, 3});
            pin(database, firstHash, first.length, 1, 1, 1);
            pin(database, secondHash, 3, 2, 5, 0);
            database.execSQL("UPDATE framed_sync_android_available_blobs SET data = ? WHERE sha256 = ?",
                new Object[] {new byte[] {1, 2, 4}, secondHash});
            try {
                FramedSyncSQLiteAvailableBodyMigration.migrateChunkedAvailableBodies(database);
                fail("bad later digest must roll back migration");
            } catch (FramedSyncValidationException expected) {
                assertEquals(1, database.getVersion());
                assertEquals(2, count(database, "framed_sync_android_blob_pins"));
                assertEquals(0, temporaryTables(database));
                assertEquals(0, tableCount(database, "framed_sync_android_available_blob_chunks"));
                assertArrayEquals(first, available(database, firstHash));
                assertArrayEquals(new byte[] {1, 2, 4}, available(database, secondHash));
            }
            database.execSQL("UPDATE framed_sync_android_available_blobs SET data = ? WHERE sha256 = ?",
                new Object[] {new byte[] {1, 2, 3}, secondHash});
            FramedSyncSQLiteAvailableBodyMigration.migrateChunkedAvailableBodies(database);
            assertEquals(2, database.getVersion());
        }
    }

    @Test
    public void reopensVersionTwoWithoutRemigratingAndRejectsVersionZero() throws Exception {
        File file = File.createTempFile("framed-available-upgrade", ".db");
        try {
            try (SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(file, null)) {
                install(database);
                database.setVersion(0);
                try {
                    FramedSyncSQLiteAvailableBodyMigration.migrateChunkedAvailableBodies(database);
                    fail("original digest migration must run first");
                } catch (FramedSyncValidationException expected) {
                    assertEquals(0, database.getVersion());
                    assertEquals(0, temporaryTables(database));
                }
                database.setVersion(1);
                insert(database, new byte[] {0, (byte) 255, (byte) 128});
                FramedSyncSQLiteAvailableBodyMigration.migrateChunkedAvailableBodies(database);
            }
            try (SQLiteDatabase reopened = SQLiteDatabase.openOrCreateDatabase(file, null)) {
                FramedSyncSQLiteAvailableBodyMigration.migrateChunkedAvailableBodies(reopened);
                assertEquals(2, reopened.getVersion());
                assertEquals(1, count(reopened, "framed_sync_android_available_blob_chunks"));
                assertEquals(0, temporaryTables(reopened));
                try (Cursor row = reopened.rawQuery("SELECT data FROM framed_sync_android_available_blob_chunks", null)) {
                    row.moveToFirst();
                    assertArrayEquals(new byte[] {0, (byte) 255, (byte) 128}, row.getBlob(0));
                }
            }
        } finally { file.delete(); }
    }

    private static void install(SQLiteDatabase database) {
        FramedSyncSQLiteSchema.install(database);
        database.setVersion(1);
    }

    private static byte[] insert(SQLiteDatabase database, byte[] body) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(body);
        database.execSQL("INSERT INTO framed_sync_android_available_blobs VALUES (?, ?, ?)",
            new Object[] {hash, body.length, body});
        return hash;
    }

    private static void pin(SQLiteDatabase database, byte[] hash, int length, int transfer, int role, int required) {
        byte[] id = {(byte) transfer};
        database.execSQL("INSERT INTO framed_sync_android_transfers VALUES (?, ?, 0, 1, ?, " +
            "'sender', 'sender-epoch', 'receiver', 'receiver-epoch', NULL, 'ready_to_apply')",
            new Object[] {id, new byte[32], length});
        database.execSQL("INSERT INTO framed_sync_android_blob_pins VALUES (?, ?, ?, ?, ?)",
            new Object[] {id, hash, length, role, required});
    }

    private static byte[] available(SQLiteDatabase database, byte[] hash) {
        try (Cursor row = database.rawQuery("SELECT data FROM framed_sync_android_available_blobs WHERE hex(sha256) = ?",
            FramedSyncSQLiteValues.blobArgs(hash))) {
            row.moveToFirst();
            return row.getBlob(0);
        }
    }

    private static int count(SQLiteDatabase database, String table) {
        try (Cursor row = database.rawQuery("SELECT count(*) FROM " + table, null)) {
            row.moveToFirst();
            return row.getInt(0);
        }
    }

    private static int temporaryTables(SQLiteDatabase database) {
        try (Cursor row = database.rawQuery("SELECT count(*) FROM sqlite_master WHERE name LIKE '%continuous_upgrade%'", null)) {
            row.moveToFirst();
            return row.getInt(0);
        }
    }

    private static int tableCount(SQLiteDatabase database, String name) {
        try (Cursor row = database.rawQuery("SELECT count(*) FROM sqlite_master WHERE name = ?", new String[] {name})) {
            row.moveToFirst();
            return row.getInt(0);
        }
    }
}
