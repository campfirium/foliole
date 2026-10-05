package com.foliole.android.framed;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public final class FramedSyncOutboundSQLite implements AutoCloseable, FramedSyncOutboundStaging {
    private static final String DATABASE_NAME = "foliole-framed-sync-outbound.db";
    private final SQLiteDatabase database;

    public FramedSyncOutboundSQLite(Context context) {
        File file = context.getApplicationContext().getDatabasePath(DATABASE_NAME);
        database = SQLiteDatabase.openOrCreateDatabase(file, null);
        install();
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
            FramedSyncStageOutcome outcome = insertOrCompareFrame(frame, header);
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
            requireCompleteFrames(transferId, attemptId);
            ContentValues values = new ContentValues(); values.put("state", "replayable");
            database.update("framed_sync_android_outbound_attempts", values,
                "hex(transfer_id) = ? AND hex(attempt_id) = ?",
                FramedSyncSQLiteValues.blobArgs(transferId, attemptId));
            database.setTransactionSuccessful();
            return FramedSyncStageOutcome.CREATED;
        } finally { database.endTransaction(); }
    }

    @Override public synchronized List<FramedSyncAuthenticatedFrame> loadReplayableOutboundFrames(
        byte[] transferId, byte[] attemptId
    ) throws Exception {
        List<FramedSyncAuthenticatedFrame> frames = new ArrayList<>();
        try (Cursor rows = database.rawQuery("SELECT a.preamble, f.frame_header, f.ciphertext, " +
            "f.authenticated_plaintext FROM framed_sync_android_outbound_attempts a JOIN " +
            "framed_sync_android_outbound_frames f ON f.transfer_id = a.transfer_id AND " +
            "f.attempt_id = a.attempt_id WHERE hex(a.transfer_id) = ? AND hex(a.attempt_id) = ? " +
            "AND a.state = 'replayable' ORDER BY length(f.sequence), f.sequence",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId))) {
            while (rows.moveToNext()) frames.add(new FramedSyncAuthenticatedFrame(
                transferId, attemptId, rows.getBlob(0), rows.getBlob(1), rows.getBlob(2), rows.getBlob(3)));
        }
        return Collections.unmodifiableList(frames);
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

    private FramedSyncStageOutcome insertOrCompareFrame(
        FramedSyncAuthenticatedFrame frame, FramedSyncWireHeader header
    ) throws Exception {
        String[] where = FramedSyncSQLiteValues.blobArgs(frame.transferId(), frame.attemptId(),
            Long.toUnsignedString(header.sequence()));
        try (Cursor row = database.query("framed_sync_android_outbound_frames",
            new String[] {"frame_header", "ciphertext", "authenticated_plaintext"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND sequence = ?", where, null, null, null)) {
            if (row.moveToFirst()) {
                boolean same = Arrays.equals(row.getBlob(0), frame.frameHeader()) &&
                    Arrays.equals(row.getBlob(1), frame.ciphertext()) && Arrays.equals(row.getBlob(2), frame.plaintext());
                if (!same) throw invalid("outbound_frame_identity_conflict");
                return FramedSyncStageOutcome.IDENTICAL;
            }
        }
        ContentValues values = new ContentValues(); values.put("transfer_id", frame.transferId());
        values.put("attempt_id", frame.attemptId()); values.put("sequence", Long.toUnsignedString(header.sequence()));
        values.put("frame_header", frame.frameHeader()); values.put("ciphertext", frame.ciphertext());
        values.put("authenticated_plaintext", frame.plaintext());
        database.insertOrThrow("framed_sync_android_outbound_frames", null, values);
        return FramedSyncStageOutcome.CREATED;
    }

    private void requireCompleteFrames(byte[] transferId, byte[] attemptId) throws Exception {
        long expected = 0; int lastType = -1;
        try (Cursor rows = database.query("framed_sync_android_outbound_frames",
            new String[] {"sequence", "frame_header"}, "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null,
            "length(sequence), sequence")) {
            while (rows.moveToNext()) {
                long sequence = Long.parseUnsignedLong(rows.getString(0));
                if (sequence != expected++) throw invalid("outbound_frame_sequence_not_contiguous");
                lastType = FramedSyncWireHeader.decode(rows.getBlob(1)).frameType();
            }
        }
        if (expected == 0 || lastType != FramedSyncFrameType.TRANSFER_TRAILER.wireValue()) {
            throw invalid("outbound_transfer_trailer_required");
        }
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
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_outbound_frames (" +
            "transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sequence TEXT NOT NULL, " +
            "frame_header BLOB NOT NULL, ciphertext BLOB NOT NULL, authenticated_plaintext BLOB NOT NULL, " +
            "PRIMARY KEY (transfer_id, attempt_id, sequence), FOREIGN KEY (transfer_id, attempt_id) REFERENCES " +
            "framed_sync_android_outbound_attempts(transfer_id, attempt_id) ON DELETE CASCADE)");
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
