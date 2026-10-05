package com.foliole.android.framed;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.foliole.sync.v22.TransferReceipt;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

final class FramedSyncSQLiteReceiptReplay {
    private final SQLiteDatabase database;
    private final FramedSyncSQLiteReceipts receipts;

    FramedSyncSQLiteReceiptReplay(SQLiteDatabase database, FramedSyncSQLiteReceipts receipts) {
        this.database = database;
        this.receipts = receipts;
    }

    FramedSyncStageOutcome prepare(byte[] transferId, byte[] attemptId, byte[] preamble)
        throws Exception {
        FramedSyncSQLiteTransfers.requireIdentities(transferId, attemptId);
        FramedSyncPreamble.decode(preamble);
        database.beginTransaction();
        try {
            if (!receipts.exists(transferId)) throw invalid("receipt_not_committed");
            FramedSyncStageOutcome outcome = insertOrCompareAttempt(transferId, attemptId, preamble);
            database.setTransactionSuccessful();
            return outcome;
        } finally {
            database.endTransaction();
        }
    }

    FramedSyncStageOutcome commitFrame(
        FramedSyncAuthenticatedFrame frame,
        TransferReceipt receipt
    ) throws Exception {
        FramedSyncSQLiteTransfers.requireIdentities(frame.transferId(), frame.attemptId());
        FramedSyncWireHeader header = FramedSyncWireHeader.decode(frame.frameHeader());
        database.beginTransaction();
        try {
            requirePrepared(frame.transferId(), frame.attemptId(), frame.preamble());
            receipts.requireStored(receipt);
            FramedSyncStageOutcome outcome = insertOrCompareFrame(frame, header);
            database.setTransactionSuccessful();
            return outcome;
        } finally {
            database.endTransaction();
        }
    }

    FramedSyncStageOutcome finalizeAttempt(byte[] transferId, byte[] attemptId) throws Exception {
        FramedSyncSQLiteTransfers.requireIdentities(transferId, attemptId);
        database.beginTransaction();
        try {
            String state = attemptState(transferId, attemptId);
            if (state == null) throw invalid("receipt_attempt_missing");
            if ("replayable".equals(state)) {
                database.setTransactionSuccessful();
                return FramedSyncStageOutcome.IDENTICAL;
            }
            if (!hasFrame(transferId, attemptId)) throw invalid("receipt_frame_required");
            ContentValues values = new ContentValues();
            values.put("state", "replayable");
            database.update("framed_sync_android_receipt_attempts", values,
                "hex(transfer_id) = ? AND hex(attempt_id) = ?",
                FramedSyncSQLiteValues.blobArgs(transferId, attemptId));
            database.setTransactionSuccessful();
            return FramedSyncStageOutcome.CREATED;
        } finally {
            database.endTransaction();
        }
    }

    List<FramedSyncAuthenticatedFrame> load(byte[] transferId, byte[] attemptId) throws Exception {
        FramedSyncSQLiteTransfers.requireIdentities(transferId, attemptId);
        List<FramedSyncAuthenticatedFrame> frames = new ArrayList<>();
        try (Cursor rows = database.rawQuery("SELECT a.preamble, f.frame_header, f.ciphertext, " +
            "f.authenticated_plaintext FROM framed_sync_android_receipt_attempts a JOIN " +
            "framed_sync_android_receipt_frames f ON f.transfer_id = a.transfer_id AND " +
            "f.attempt_id = a.attempt_id WHERE hex(a.transfer_id) = ? AND hex(a.attempt_id) = ? " +
            "AND a.state = 'replayable' ORDER BY length(f.sequence), f.sequence",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId))) {
            while (rows.moveToNext()) frames.add(new FramedSyncAuthenticatedFrame(
                transferId, attemptId, rows.getBlob(0), rows.getBlob(1), rows.getBlob(2), rows.getBlob(3)));
        }
        return Collections.unmodifiableList(frames);
    }

    private FramedSyncStageOutcome insertOrCompareAttempt(byte[] transferId, byte[] attemptId, byte[] preamble)
        throws FramedSyncValidationException {
        try (Cursor row = database.query("framed_sync_android_receipt_attempts",
            new String[] {"preamble"}, "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null, null)) {
            if (row.moveToFirst()) {
                if (!Arrays.equals(row.getBlob(0), preamble)) throw invalid("receipt_attempt_identity_conflict");
                return FramedSyncStageOutcome.IDENTICAL;
            }
        }
        ContentValues values = new ContentValues();
        values.put("transfer_id", transferId);
        values.put("attempt_id", attemptId);
        values.put("preamble", preamble);
        values.put("state", "prepared");
        database.insertOrThrow("framed_sync_android_receipt_attempts", null, values);
        return FramedSyncStageOutcome.CREATED;
    }

    private FramedSyncStageOutcome insertOrCompareFrame(
        FramedSyncAuthenticatedFrame frame,
        FramedSyncWireHeader header
    ) throws FramedSyncValidationException {
        try (Cursor row = database.query("framed_sync_android_receipt_frames",
            new String[] {"frame_header", "ciphertext", "authenticated_plaintext"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND sequence = ?",
            FramedSyncSQLiteValues.blobArgs(frame.transferId(), frame.attemptId(),
                Long.toUnsignedString(header.sequence())), null, null, null)) {
            if (row.moveToFirst()) {
                boolean same = Arrays.equals(row.getBlob(0), frame.frameHeader()) &&
                    Arrays.equals(row.getBlob(1), frame.ciphertext()) &&
                    Arrays.equals(row.getBlob(2), frame.plaintext());
                if (!same) throw invalid("receipt_frame_identity_conflict");
                return FramedSyncStageOutcome.IDENTICAL;
            }
        }
        ContentValues values = new ContentValues();
        values.put("transfer_id", frame.transferId());
        values.put("attempt_id", frame.attemptId());
        values.put("sequence", Long.toUnsignedString(header.sequence()));
        values.put("frame_header", frame.frameHeader());
        values.put("ciphertext", frame.ciphertext());
        values.put("authenticated_plaintext", frame.plaintext());
        database.insertOrThrow("framed_sync_android_receipt_frames", null, values);
        return FramedSyncStageOutcome.CREATED;
    }

    private void requirePrepared(byte[] transferId, byte[] attemptId, byte[] preamble)
        throws FramedSyncValidationException {
        try (Cursor row = database.query("framed_sync_android_receipt_attempts",
            new String[] {"preamble", "state"}, "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null, null)) {
            if (!row.moveToFirst() || !Arrays.equals(row.getBlob(0), preamble) ||
                !"prepared".equals(row.getString(1))) throw invalid("receipt_attempt_not_prepared");
        }
    }

    private String attemptState(byte[] transferId, byte[] attemptId) {
        try (Cursor row = database.query("framed_sync_android_receipt_attempts", new String[] {"state"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null, null)) {
            return row.moveToFirst() ? row.getString(0) : null;
        }
    }

    private boolean hasFrame(byte[] transferId, byte[] attemptId) {
        try (Cursor row = database.query("framed_sync_android_receipt_frames", new String[] {"1"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null, null)) {
            return row.moveToFirst();
        }
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
