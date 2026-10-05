package com.foliole.android.framed;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferReceipt;
import java.util.Arrays;

final class FramedSyncSQLiteReceipts {
    private final SQLiteDatabase database;

    FramedSyncSQLiteReceipts(SQLiteDatabase database) {
        this.database = database;
    }

    FramedSyncStageOutcome commit(TransferReceipt receipt) throws Exception {
        FramedSyncCodec.validateOutbound(ProtocolMessage.newBuilder().setTransferReceipt(receipt).build(),
            FramedSyncFrameType.TRANSFER_RECEIPT.wireValue());
        database.beginTransaction();
        try {
            requireReadyTransfer(receipt);
            FramedSyncStageOutcome outcome = insertOrCompare(receipt);
            ContentValues transfer = new ContentValues();
            transfer.put("state", "applied");
            database.update("framed_sync_android_transfers", transfer, "hex(transfer_id) = ?",
                FramedSyncSQLiteValues.blobArgs(receipt.getTransferId().toByteArray()));
            database.setTransactionSuccessful();
            return outcome;
        } finally {
            database.endTransaction();
        }
    }

    void requireStored(TransferReceipt receipt) throws FramedSyncValidationException {
        try (Cursor row = row(receipt.getTransferId().toByteArray())) {
            if (!row.moveToFirst() || !matches(row, receipt)) throw invalid("receipt_not_committed");
        }
    }

    boolean exists(byte[] transferId) {
        try (Cursor row = row(transferId)) { return row.moveToFirst(); }
    }

    private FramedSyncStageOutcome insertOrCompare(TransferReceipt receipt)
        throws FramedSyncValidationException {
        try (Cursor row = row(receipt.getTransferId().toByteArray())) {
            if (row.moveToFirst()) {
                if (!matches(row, receipt)) throw invalid("receipt_identity_conflict");
                return FramedSyncStageOutcome.IDENTICAL;
            }
        }
        ContentValues values = new ContentValues();
        values.put("transfer_id", receipt.getTransferId().toByteArray());
        values.put("content_id", receipt.getContentId().toByteArray());
        values.put("receiver_device_id", receipt.getReceiverDeviceId());
        values.put("receiver_library_epoch", receipt.getReceiverLibraryEpoch());
        values.put("applied_state_hash", receipt.getAppliedStateHash().toByteArray());
        database.insertOrThrow("framed_sync_android_receipts", null, values);
        return FramedSyncStageOutcome.CREATED;
    }

    private void requireReadyTransfer(TransferReceipt receipt) throws FramedSyncValidationException {
        try (Cursor row = database.query("framed_sync_android_transfers",
            new String[] {"content_id", "receiver_device_id", "receiver_library_epoch", "state"},
            "hex(transfer_id) = ?", FramedSyncSQLiteValues.blobArgs(
                receipt.getTransferId().toByteArray()), null, null, null)) {
            if (!row.moveToFirst() || !("ready_to_apply".equals(row.getString(3)) ||
                "applied".equals(row.getString(3))) ||
                !Arrays.equals(row.getBlob(0), receipt.getContentId().toByteArray()) ||
                !row.getString(1).equals(receipt.getReceiverDeviceId()) ||
                !row.getString(2).equals(receipt.getReceiverLibraryEpoch())) {
                throw invalid("inbound_transfer_not_ready");
            }
        }
    }

    private Cursor row(byte[] transferId) {
        return database.query("framed_sync_android_receipts", null, "hex(transfer_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId), null, null, null);
    }

    private static boolean matches(Cursor row, TransferReceipt value) {
        return Arrays.equals(row.getBlob(row.getColumnIndexOrThrow("content_id")), value.getContentId().toByteArray()) &&
            row.getString(row.getColumnIndexOrThrow("receiver_device_id")).equals(value.getReceiverDeviceId()) &&
            row.getString(row.getColumnIndexOrThrow("receiver_library_epoch")).equals(value.getReceiverLibraryEpoch()) &&
            Arrays.equals(row.getBlob(row.getColumnIndexOrThrow("applied_state_hash")),
                value.getAppliedStateHash().toByteArray());
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
