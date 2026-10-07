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
public final class FramedSyncSQLiteChunkedBodiesTest {
    private static final byte[] TRANSFER = {1};
    private static final byte[] ATTEMPT = {2};

    @Test
    public void unalignedReceivingChunksPersistCanonicalBodyAcrossReopen() throws Exception {
        File file = File.createTempFile("framed-chunked-body", ".db");
        byte[] body = new byte[FramedSyncBodyChunkStream.CHUNK_BYTES + 17];
        Arrays.fill(body, (byte) 73);
        byte[] hash = hash(body);
        try {
            try (SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(file, null)) {
                install(database);
                receiving(database, hash, 0, Arrays.copyOfRange(body, 0, 29));
                receiving(database, hash, 29, Arrays.copyOfRange(body, 29, body.length));
                assertEquals(FramedSyncBodyChunkStream.Result.VERIFIED, promote(database, hash, body.length));
                assertEquals(2, count(database, "framed_sync_android_available_blob_chunks"));
                try (Cursor row = database.rawQuery("SELECT data FROM framed_sync_android_available_blob_chunks " +
                    "WHERE byte_offset = 524288", null)) {
                    row.moveToFirst();
                    assertArrayEquals(Arrays.copyOfRange(body, 524288, body.length), row.getBlob(0));
                }
                database.execSQL("DELETE FROM framed_sync_android_blob_chunks");
            }
            try (SQLiteDatabase reopened = SQLiteDatabase.openOrCreateDatabase(file, null)) {
                assertEquals(FramedSyncBodyChunkStream.Result.VERIFIED, promote(reopened, hash, body.length));
            }
        } finally { file.delete(); }
    }

    @Test
    public void missingReceivingIsOptionalButExistingCorruptionIsInvalid() throws Exception {
        try (SQLiteDatabase database = SQLiteDatabase.create(null)) {
            install(database);
            byte[] body = {1, 2, 3};
            byte[] hash = hash(body);
            receiving(database, hash, 0, new byte[] {1});
            assertEquals(FramedSyncBodyChunkStream.Result.MISSING, promote(database, hash, body.length));
            assertEquals(0, count(database, "framed_sync_android_available_blobs"));
            database.execSQL("DELETE FROM framed_sync_android_blob_chunks");
            receiving(database, hash, 0, new byte[] {1, 2, 4});
            assertEquals(FramedSyncBodyChunkStream.Result.INVALID, promote(database, hash, body.length));
            assertEquals(0, count(database, "framed_sync_android_available_blobs"));
            database.execSQL("INSERT INTO framed_sync_android_available_blobs VALUES (?, ?)",
                new Object[] {hash, body.length});
            assertEquals(FramedSyncBodyChunkStream.Result.INVALID, promote(database, hash, body.length));
            database.execSQL("INSERT INTO framed_sync_android_available_blob_chunks VALUES (?, 0, ?)",
                new Object[] {hash, new byte[] {1, 2, 4}});
            assertEquals(FramedSyncBodyChunkStream.Result.INVALID, promote(database, hash, body.length));
        }
    }

    @Test
    public void failedChunkInsertRollsBackHeaderAndReceivingRemainsRetryable() throws Exception {
        try (SQLiteDatabase database = SQLiteDatabase.create(null)) {
            install(database);
            byte[] body = {1, 2, 3};
            byte[] hash = hash(body);
            receiving(database, hash, 0, body);
            database.execSQL("CREATE TRIGGER fail_chunk BEFORE INSERT ON framed_sync_android_available_blob_chunks " +
                "BEGIN SELECT RAISE(ABORT, 'chunk_failure'); END");
            try {
                promote(database, hash, body.length);
                fail("chunk insert must fail");
            } catch (android.database.sqlite.SQLiteException expected) {
                assertEquals(0, count(database, "framed_sync_android_available_blobs"));
                assertEquals(0, count(database, "framed_sync_android_available_blob_chunks"));
                assertEquals(1, count(database, "framed_sync_android_blob_chunks"));
            }
            database.execSQL("DROP TRIGGER fail_chunk");
            assertEquals(FramedSyncBodyChunkStream.Result.VERIFIED, promote(database, hash, body.length));
        }
    }

    private static FramedSyncBodyChunkStream.Result promote(SQLiteDatabase database, byte[] hash, long length)
        throws Exception {
        database.beginTransaction();
        try {
            FramedSyncBodyChunkStream.Result result = new FramedSyncSQLiteChunkedBodies(database)
                .verifyAndPromote(TRANSFER, ATTEMPT, hash, length);
            database.setTransactionSuccessful();
            return result;
        } finally { database.endTransaction(); }
    }

    private static void install(SQLiteDatabase database) {
        database.execSQL("PRAGMA foreign_keys = ON");
        database.execSQL("CREATE TABLE framed_sync_android_available_blobs " +
            "(sha256 BLOB PRIMARY KEY, byte_length INTEGER NOT NULL)");
        database.execSQL("CREATE TABLE framed_sync_android_available_blob_chunks " +
            "(sha256 BLOB NOT NULL REFERENCES framed_sync_android_available_blobs(sha256) ON DELETE CASCADE, " +
            "byte_offset INTEGER NOT NULL CHECK (byte_offset >= 0 AND byte_offset % 524288 = 0), " +
            "data BLOB NOT NULL CHECK (typeof(data) = 'blob' AND length(data) BETWEEN 1 AND 524288), " +
            "PRIMARY KEY (sha256, byte_offset))");
        database.execSQL("CREATE TABLE framed_sync_android_blob_chunks " +
            "(transfer_id BLOB, attempt_id BLOB, sha256 BLOB, byte_offset INTEGER, data BLOB, " +
            "PRIMARY KEY (transfer_id, attempt_id, sha256, byte_offset))");
    }

    private static void receiving(SQLiteDatabase database, byte[] hash, long offset, byte[] data) {
        database.execSQL("INSERT INTO framed_sync_android_blob_chunks VALUES (?, ?, ?, ?, ?)",
            new Object[] {TRANSFER, ATTEMPT, hash, offset, data});
    }

    private static int count(SQLiteDatabase database, String table) {
        try (Cursor row = database.rawQuery("SELECT count(*) FROM " + table, null)) {
            row.moveToFirst();
            return row.getInt(0);
        }
    }

    private static byte[] hash(byte[] data) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(data);
    }
}
