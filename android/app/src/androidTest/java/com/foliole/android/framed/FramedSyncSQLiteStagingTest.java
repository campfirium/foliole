package com.foliole.android.framed;

import static com.foliole.android.framed.FramedSyncSQLiteFixture.*;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.File;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FramedSyncSQLiteStagingTest {
    @Test
    public void validatesBeforeWritingAndIsolatesAttemptsFactsAndBlobs() throws Exception {
        File file = File.createTempFile("framed-sync-staging", ".db");
        try (SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(file, null)) {
            FramedSyncSQLiteStaging staging = new FramedSyncSQLiteStaging(database);
            FramedSyncInboundStagingAdapter adapter = new FramedSyncInboundStagingAdapter(staging);
            assertEquals(FramedSyncStageOutcome.CREATED, staging.admitInboundTransfer(proposal()));
            assertEquals(FramedSyncStageOutcome.IDENTICAL, staging.admitInboundTransfer(proposal()));

            reject(() -> adapter.commitAuthenticatedFrame(new FramedSyncAuthenticatedFrame(
                TRANSFER_ID, ATTEMPT_A, preamble(),
                FramedSyncWireHeader.encode(1, 0, FramedSyncFrameType.TRANSFER_HEADER.wireValue()),
                new byte[] {1}, new byte[] {1, 2, 3})), "protocol_decode_invalid");
            assertEquals(0, count(database, "framed_sync_android_attempts"));

            var headerA = frame(ATTEMPT_A, 0, FramedSyncFrameType.TRANSFER_HEADER,
                header(ATTEMPT_A), new byte[] {10});
            assertEquals(FramedSyncStageOutcome.CREATED, adapter.commitAuthenticatedFrame(headerA));
            assertEquals(FramedSyncStageOutcome.IDENTICAL, adapter.commitAuthenticatedFrame(headerA));
            staging.invalidateInboundAttempt(TRANSFER_ID, ATTEMPT_A);
            assertEquals(0, count(database, "framed_sync_android_frames"));
            assertEquals("invalidated", scalar(database,
                "SELECT state FROM framed_sync_android_attempts WHERE hex(attempt_id) = ?", ATTEMPT_A));

            adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 0, FramedSyncFrameType.TRANSFER_HEADER,
                header(ATTEMPT_B), new byte[] {20}));
            adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 1, FramedSyncFrameType.FACT,
                fact("original"), new byte[] {21}));
            reject(() -> adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 2,
                FramedSyncFrameType.FACT, fact("conflict"), new byte[] {22})),
                "inbound_fact_identity_conflict");
            assertEquals(2, count(database, "framed_sync_android_frames"));
            adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 2, FramedSyncFrameType.BLOB_CHUNK,
                chunk(), new byte[] {23}));
            adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 3, FramedSyncFrameType.TRANSFER_TRAILER,
                trailer(), new byte[] {24}));
            assertEquals(1, count(database, "framed_sync_android_facts"));
            assertEquals(1, count(database, "framed_sync_android_available_blobs"));
            assertEquals(1, count(database, "framed_sync_android_blob_pins"));
            assertEquals("ready_to_apply", scalar(database,
                "SELECT state FROM framed_sync_android_transfers", new byte[0]));
        } finally {
            file.delete();
        }
    }

    @Test
    public void replaysExactReceiptCiphertextAfterDatabaseReopen() throws Exception {
        File file = File.createTempFile("framed-sync-receipt", ".db");
        byte[] ciphertext = new byte[] {31, 32, 33};
        try {
            try (SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(file, null)) {
                FramedSyncSQLiteStaging staging = completeTransfer(database);
                staging.commitReceipt(receipt());
                staging.prepareReceiptAttempt(TRANSFER_ID, RECEIPT_ATTEMPT, preamble());
                new FramedSyncInboundStagingAdapter(staging).commitAuthenticatedFrame(frame(
                    RECEIPT_ATTEMPT, 0, FramedSyncFrameType.TRANSFER_RECEIPT,
                    com.foliole.sync.v22.ProtocolMessage.newBuilder().setTransferReceipt(receipt()).build(),
                    ciphertext));
                staging.finalizeReceiptAttempt(TRANSFER_ID, RECEIPT_ATTEMPT);
            }
            try (SQLiteDatabase reopened = SQLiteDatabase.openDatabase(
                file.getPath(), null, SQLiteDatabase.OPEN_READWRITE)) {
                List<FramedSyncAuthenticatedFrame> frames = new FramedSyncSQLiteStaging(reopened)
                    .loadReplayableReceiptFrames(TRANSFER_ID, RECEIPT_ATTEMPT);
                assertEquals(1, frames.size());
                assertArrayEquals(ciphertext, frames.get(0).ciphertext());
            }
        } finally {
            file.delete();
        }
    }

    @Test
    public void acceptsFreshTransferAttemptAfterReceiptAndRestoresAppliedStateOnFailure() throws Exception {
        File file = File.createTempFile("framed-sync-retry", ".db");
        try (SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(file, null)) {
            FramedSyncSQLiteStaging staging = completeTransfer(database);
            staging.commitReceipt(receipt());
            assertEquals(FramedSyncStageOutcome.IDENTICAL, staging.admitInboundTransfer(proposal()));

            new FramedSyncInboundStagingAdapter(staging).commitAuthenticatedFrame(
                frame(ATTEMPT_A, 0, FramedSyncFrameType.TRANSFER_HEADER,
                    header(ATTEMPT_A), new byte[] {50}));
            assertEquals("receiving", scalar(database,
                "SELECT state FROM framed_sync_android_transfers", new byte[0]));
            staging.invalidateInboundAttempt(TRANSFER_ID, ATTEMPT_A);
            assertEquals("applied", scalar(database,
                "SELECT state FROM framed_sync_android_transfers", new byte[0]));
        } finally {
            file.delete();
        }
    }

    private static FramedSyncSQLiteStaging completeTransfer(SQLiteDatabase database) throws Exception {
        FramedSyncSQLiteStaging staging = new FramedSyncSQLiteStaging(database);
        FramedSyncInboundStagingAdapter adapter = new FramedSyncInboundStagingAdapter(staging);
        staging.admitInboundTransfer(proposal());
        adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 0, FramedSyncFrameType.TRANSFER_HEADER,
            header(ATTEMPT_B), new byte[] {40}));
        adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 1, FramedSyncFrameType.FACT,
            fact("original"), new byte[] {41}));
        adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 2, FramedSyncFrameType.BLOB_CHUNK,
            chunk(), new byte[] {42}));
        adapter.commitAuthenticatedFrame(frame(ATTEMPT_B, 3, FramedSyncFrameType.TRANSFER_TRAILER,
            trailer(), new byte[] {43}));
        return staging;
    }

    private static int count(SQLiteDatabase database, String table) {
        try (Cursor row = database.rawQuery("SELECT COUNT(*) FROM " + table, null)) {
            row.moveToFirst();
            return row.getInt(0);
        }
    }

    private static String scalar(SQLiteDatabase database, String sql, byte[] argument) {
        String[] args = argument.length == 0 ? null : FramedSyncSQLiteValues.blobArgs(argument);
        try (Cursor row = database.rawQuery(sql, args)) {
            row.moveToFirst();
            return row.getString(0);
        }
    }

    private static void reject(ThrowingRunnable action, String code) throws Exception {
        try {
            action.run();
            fail("expected rejection: " + code);
        } catch (FramedSyncValidationException expected) {
            assertEquals(code, expected.code());
        }
    }

    private interface ThrowingRunnable { void run() throws Exception; }
}
