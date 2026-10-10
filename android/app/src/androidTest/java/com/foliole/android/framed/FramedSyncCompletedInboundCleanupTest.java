package com.foliole.android.framed;

import static com.foliole.android.framed.FramedSyncSQLiteFixture.*;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import android.database.sqlite.SQLiteDatabase;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.google.protobuf.ByteString;
import java.io.File;
import java.security.MessageDigest;
import java.util.Arrays;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FramedSyncCompletedInboundCleanupTest {
    @Test
    public void retiresEveryPayloadAcrossCursorWindowsAndPreservesReplayIdentities() throws Exception {
        File file = File.createTempFile("framed-sync-cleanup-windows", ".db");
        byte[] otherTransfer = TRANSFER_ID.clone();
        otherTransfer[0] ^= 1;
        try {
            try (SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(file, null)) {
                FramedSyncSQLiteStaging staging = new FramedSyncSQLiteStaging(database);
                staging.admitInboundTransfer(proposal());
                staging.admitInboundTransfer(proposal().toBuilder()
                    .setTransferId(ByteString.copyFrom(otherTransfer)).build());
                addAttempt(database, TRANSFER_ID);
                addAttempt(database, otherTransfer);
                for (int sequence = 0; sequence < 28; sequence++) {
                    addFrame(database, TRANSFER_ID, sequence, 4, payload(sequence));
                }
                addFrame(database, TRANSFER_ID, 28, 4, BLOB_HASH);
                addFrame(database, TRANSFER_ID, 29, 3, BLOB);
                addFrame(database, otherTransfer, 0, 4, BLOB);
                new FramedSyncSQLiteTransfers(database).promote(TRANSFER_ID, ATTEMPT_A);
                verifyFrames(database, otherTransfer);
                FramedSyncCompletedInboundCleanup.retireReadyCopies(database, TRANSFER_ID);
                verifyFrames(database, otherTransfer);
            }
            try (SQLiteDatabase database = SQLiteDatabase.openDatabase(
                file.getPath(), null, SQLiteDatabase.OPEN_READWRITE)) {
                FramedSyncCompletedInboundCleanup.recover(database);
                verifyFrames(database, otherTransfer);
            }
        } finally { file.delete(); }
    }

    private static void addAttempt(SQLiteDatabase database, byte[] transferId) {
        database.execSQL("INSERT INTO framed_sync_android_attempts VALUES (?, ?, 'receiving')",
            new Object[] {transferId, ATTEMPT_A});
    }

    private static void addFrame(SQLiteDatabase database, byte[] transferId,
        int sequence, int type, byte[] plaintext) {
        database.execSQL("INSERT INTO framed_sync_android_frames VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            new Object[] {transferId, ATTEMPT_A, String.valueOf(sequence), type,
                preamble(), new byte[] {1}, BLOB_HASH, plaintext});
    }

    private static byte[] payload(int sequence) {
        byte[] result = new byte[FramedSyncContract.BLOB_CHUNK_BYTES];
        Arrays.fill(result, (byte) sequence);
        return result;
    }

    private static void verifyFrames(SQLiteDatabase database, byte[] otherTransfer) throws Exception {
        try (var rows = database.rawQuery("SELECT sequence, authenticated_plaintext " +
            "FROM framed_sync_android_frames WHERE hex(transfer_id) = ? ORDER BY length(sequence), sequence",
            FramedSyncSQLiteValues.blobArgs(TRANSFER_ID))) {
            int count = 0;
            while (rows.moveToNext()) {
                int sequence = Integer.parseInt(rows.getString(0));
                byte[] expected = sequence < 28 ? MessageDigest.getInstance("SHA-256").digest(payload(sequence)) :
                    sequence == 28 ? BLOB_HASH : BLOB;
                assertArrayEquals(expected, rows.getBlob(1));
                count++;
            }
            assertEquals(30, count);
        }
        try (var row = database.rawQuery("SELECT authenticated_plaintext FROM framed_sync_android_frames " +
            "WHERE hex(transfer_id) = ?", FramedSyncSQLiteValues.blobArgs(otherTransfer))) {
            assertEquals(true, row.moveToFirst());
            assertArrayEquals(BLOB, row.getBlob(0));
        }
    }
}
