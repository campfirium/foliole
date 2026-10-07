package com.foliole.android.framed;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;
import java.security.MessageDigest;
import java.util.Arrays;

public final class FramedSyncOutboundSQLite implements AutoCloseable, FramedSyncOutboundStaging {
    private static final String DATABASE_NAME = "foliole-framed-sync-outbound.db";
    private final SQLiteDatabase database;
    private final FramedSyncOutboundFrameFiles frames;

    public FramedSyncOutboundSQLite(Context context) {
        File file = context.getApplicationContext().getDatabasePath(DATABASE_NAME);
        database = SQLiteDatabase.openOrCreateDatabase(file, null);
        install();
        frames = new FramedSyncOutboundFrameFiles(database,
            new File(context.getApplicationContext().getFilesDir(), "framed-sync/outbound"));
    }

    @Override public synchronized FramedSyncStageOutcome prepareOutboundAttempt(
        byte[] transferId, byte[] attemptId, byte[] preamble
    ) throws Exception {
        requireBinding(transferId, attemptId, preamble);
        database.beginTransaction();
        try {
            FramedSyncStageOutcome outcome = insertOrCompareAttempt(transferId, attemptId, preamble);
            database.setTransactionSuccessful();
            return outcome;
        } finally { database.endTransaction(); }
    }

    @Override public synchronized FramedSyncStageOutcome commitOutboundFrame(
        FramedSyncAuthenticatedFrame frame
    ) throws Exception {
        requireBinding(frame.transferId(), frame.attemptId(), frame.preamble());
        FramedSyncWireHeader header = FramedSyncWireHeader.decode(frame.frameHeader());
        database.beginTransaction();
        try {
            requirePrepared(frame.transferId(), frame.attemptId(), frame.preamble());
            FramedSyncStageOutcome outcome = frames.commit(frame, header);
            database.setTransactionSuccessful();
            return outcome;
        } finally { database.endTransaction(); }
    }

    @Override public synchronized FramedSyncStageOutcome finalizeOutboundAttempt(
        byte[] transferId, byte[] attemptId
    ) throws Exception {
        database.beginTransaction();
        try {
            String state = state(transferId, attemptId);
            if (state == null) throw invalid("outbound_attempt_missing");
            if ("replayable".equals(state)) return identicalTransaction();
            frames.requireComplete(transferId, attemptId);
            ContentValues values = new ContentValues(); values.put("state", "replayable");
            database.update("framed_sync_android_outbound_attempts", values,
                "hex(transfer_id) = ? AND hex(attempt_id) = ?",
                FramedSyncSQLiteValues.blobArgs(transferId, attemptId));
            database.setTransactionSuccessful();
            return FramedSyncStageOutcome.CREATED;
        } finally { database.endTransaction(); }
    }

    @Override public synchronized void replayOutboundFrames(
        byte[] transferId, byte[] attemptId, FramedSyncStreamWriter writer
    ) throws Exception {
        frames.replay(transferId, attemptId, writer);
    }

    public synchronized FramedSyncTransferWriter.Attempt loadLatestReplayableAttempt(
        byte[] transferId
    ) {
        if (transferId == null || transferId.length != FramedSyncContract.DIGEST_BYTES) {
            throw new IllegalArgumentException("transfer_id_invalid");
        }
        try (Cursor row = database.rawQuery(
            "SELECT attempt_id, preamble FROM framed_sync_android_outbound_attempts a " +
                "WHERE hex(transfer_id) = ? AND state = 'replayable' AND EXISTS (SELECT 1 FROM " +
                frames.table() + " f WHERE f.transfer_id = a.transfer_id AND f.attempt_id = a.attempt_id) " +
                "ORDER BY rowid DESC LIMIT 1",
            FramedSyncSQLiteValues.blobArgs(transferId))) {
            return row.moveToFirst()
                ? new FramedSyncTransferWriter.Attempt(transferId, row.getBlob(0), row.getBlob(1))
                : null;
        }
    }

    public synchronized void discardOutboundAttempts(byte[] transferId) throws Exception {
        database.beginTransaction();
        try {
            try (Cursor rows = database.rawQuery(
                "SELECT attempt_id FROM framed_sync_android_outbound_attempts WHERE hex(transfer_id) = ?",
                FramedSyncSQLiteValues.blobArgs(transferId))) {
                while (rows.moveToNext()) frames.remove(transferId, rows.getBlob(0));
            }
            database.delete("framed_sync_android_outbound_attempts", "hex(transfer_id) = ?",
                FramedSyncSQLiteValues.blobArgs(transferId));
            database.setTransactionSuccessful();
        } finally { database.endTransaction(); }
    }

    /** Bootstrap runs before senders start; only rebuildable transport attempts are retired. */
    public synchronized void discardInterruptedAttempts() throws Exception {
        java.util.List<byte[]> transfers = new java.util.ArrayList<>();
        try (Cursor rows = database.rawQuery(
            "SELECT DISTINCT transfer_id FROM framed_sync_android_outbound_attempts", null)) {
            while (rows.moveToNext()) transfers.add(rows.getBlob(0));
        }
        for (byte[] transferId : transfers) discardOutboundAttempts(transferId);
    }

    @Override public synchronized void close() { database.close(); }

    private FramedSyncStageOutcome insertOrCompareAttempt(
        byte[] transferId, byte[] attemptId, byte[] preamble
    ) throws Exception {
        try (Cursor row = database.query("framed_sync_android_outbound_attempts",
            new String[] {"preamble"}, "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null, null)) {
            if (row.moveToFirst()) {
                if (!Arrays.equals(row.getBlob(0), preamble)) throw invalid("outbound_attempt_identity_conflict");
                return FramedSyncStageOutcome.IDENTICAL;
            }
        }
        ContentValues values = new ContentValues(); values.put("transfer_id", transferId);
        values.put("attempt_id", attemptId); values.put("preamble", preamble); values.put("state", "prepared");
        database.insertOrThrow("framed_sync_android_outbound_attempts", null, values);
        return FramedSyncStageOutcome.CREATED;
    }

    private void requirePrepared(byte[] transferId, byte[] attemptId, byte[] preamble) throws Exception {
        try (Cursor row = database.query("framed_sync_android_outbound_attempts",
            new String[] {"preamble", "state"}, "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null, null)) {
            if (!row.moveToFirst() || !Arrays.equals(row.getBlob(0), preamble) ||
                !"prepared".equals(row.getString(1))) throw invalid("outbound_attempt_not_prepared");
        }
    }

    private String state(byte[] transferId, byte[] attemptId) {
        try (Cursor row = database.query("framed_sync_android_outbound_attempts", new String[] {"state"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ?", FramedSyncSQLiteValues.blobArgs(transferId, attemptId),
            null, null, null)) { return row.moveToFirst() ? row.getString(0) : null; }
    }

    private FramedSyncStageOutcome identicalTransaction() {
        database.setTransactionSuccessful(); return FramedSyncStageOutcome.IDENTICAL;
    }

    private static void requireBinding(byte[] transferId, byte[] attemptId, byte[] encoded) throws Exception {
        FramedSyncSQLiteTransfers.requireIdentities(transferId, attemptId);
        FramedSyncPreamble preamble = FramedSyncPreamble.decode(encoded);
        if (!MessageDigest.isEqual(preamble.contextId(), transferId) ||
            !MessageDigest.isEqual(preamble.identifier(), attemptId)) throw invalid("outbound_attempt_binding_mismatch");
    }

    private void install() {
        database.execSQL("PRAGMA foreign_keys = ON");
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_outbound_attempts (" +
            "transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, preamble BLOB NOT NULL, " +
            "state TEXT NOT NULL CHECK (state IN ('prepared','replayable')), PRIMARY KEY (transfer_id, attempt_id))");
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
