package com.foliole.android.framed;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.foliole.sync.v22.ProtocolMessage;
import com.foliole.sync.v22.TransferHeader;
import com.foliole.sync.v22.TransferProposal;

final class FramedSyncSQLiteTransfers {
    private final SQLiteDatabase database;

    FramedSyncSQLiteTransfers(SQLiteDatabase database) {
        this.database = database;
    }

    FramedSyncStageOutcome admit(TransferProposal proposal) throws Exception {
        FramedSyncCodec.validateOutbound(ProtocolMessage.newBuilder().setTransferProposal(proposal).build(),
            FramedSyncFrameType.SESSION_CONTROL.wireValue());
        database.beginTransaction();
        try {
            FramedSyncStageOutcome outcome = insertOrCompare(proposal);
            database.setTransactionSuccessful();
            return outcome;
        } finally {
            database.endTransaction();
        }
    }

    void stageHeader(FramedSyncAuthenticatedFrame frame, TransferHeader header) throws Exception {
        TransferProposal proposal = loadProposal(frame.transferId());
        if (proposal == null) throw invalid("inbound_proposal_required");
        long totalBlobBytes = 0;
        for (var blob : header.getManifest().getBlobsList()) totalBlobBytes += blob.getByteLength();
        if (!header.getManifest().getContentId().equals(proposal.getContentId()) ||
            header.getManifest().getFactsCount() != proposal.getFactCount() ||
            header.getManifest().getBlobsCount() != proposal.getBlobCount() ||
            totalBlobBytes != proposal.getTotalBlobBytes()) {
            throw invalid("inbound_header_proposal_mismatch");
        }
        requireProposed(frame.transferId());
        if (attemptExists(frame.transferId(), frame.attemptId())) throw invalid("attempt_id_reuse");
        ContentValues attempt = new ContentValues();
        attempt.put("transfer_id", frame.transferId());
        attempt.put("attempt_id", frame.attemptId());
        attempt.put("state", "receiving");
        database.insertOrThrow("framed_sync_android_attempts", null, attempt);
        ContentValues transfer = new ContentValues();
        transfer.put("active_attempt_id", frame.attemptId());
        transfer.put("state", "receiving");
        database.update("framed_sync_android_transfers", transfer, "hex(transfer_id) = ?",
            FramedSyncSQLiteValues.blobArgs(frame.transferId()));
    }

    void requireReceivingAttempt(byte[] transferId, byte[] attemptId)
        throws FramedSyncValidationException {
        try (Cursor row = database.rawQuery("SELECT 1 FROM framed_sync_android_attempts a JOIN " +
            "framed_sync_android_transfers t ON t.transfer_id = a.transfer_id WHERE " +
            "hex(a.transfer_id) = ? AND hex(a.attempt_id) = ? AND a.state = 'receiving' AND " +
            "hex(t.active_attempt_id) = hex(a.attempt_id)",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId))) {
            if (!row.moveToFirst()) throw invalid("inbound_attempt_unavailable");
        }
    }

    TransferHeader loadHeader(byte[] transferId, byte[] attemptId) throws Exception {
        try (Cursor row = database.query("framed_sync_android_frames", new String[] {"authenticated_plaintext"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND frame_type = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId,
                FramedSyncFrameType.TRANSFER_HEADER.wireValue()), null, null, null)) {
            if (!row.moveToFirst()) return null;
            return ProtocolMessage.parseFrom(row.getBlob(0)).getTransferHeader();
        }
    }

    void promote(byte[] transferId, byte[] attemptId) {
        ContentValues attempt = new ContentValues();
        attempt.put("state", "promoted");
        database.update("framed_sync_android_attempts", attempt,
            "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId));
        ContentValues transfer = new ContentValues();
        transfer.put("state", "ready_to_apply");
        database.update("framed_sync_android_transfers", transfer, "hex(transfer_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId));
    }

    void invalidate(byte[] transferId, byte[] attemptId) throws Exception {
        requireIdentities(transferId, attemptId);
        database.beginTransaction();
        try {
            clearAttempt(transferId, attemptId);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    void clearAttempt(byte[] transferId, byte[] attemptId) {
        for (String table : new String[] {"framed_sync_android_facts", "framed_sync_android_blob_chunks",
            "framed_sync_android_frames", "framed_sync_android_blob_offers"}) {
            database.delete(table, "hex(transfer_id) = ? AND hex(attempt_id) = ?",
                FramedSyncSQLiteValues.blobArgs(transferId, attemptId));
        }
        database.delete("framed_sync_android_blob_pins", "hex(transfer_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId));
        ContentValues attempt = new ContentValues();
        attempt.put("state", "invalidated");
        database.update("framed_sync_android_attempts", attempt,
            "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId));
        database.execSQL("UPDATE framed_sync_android_transfers SET active_attempt_id = NULL, " +
            "state = 'proposed' WHERE hex(transfer_id) = ? AND hex(active_attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId));
    }

    private FramedSyncStageOutcome insertOrCompare(TransferProposal proposal)
        throws FramedSyncValidationException {
        byte[] transferId = proposal.getTransferId().toByteArray();
        try (Cursor row = database.query("framed_sync_android_transfers", null,
            "hex(transfer_id) = ?", FramedSyncSQLiteValues.blobArgs(transferId), null, null, null)) {
            if (row.moveToFirst()) {
                if (!proposal(row).equals(proposal)) throw invalid("inbound_proposal_conflict");
                return FramedSyncStageOutcome.IDENTICAL;
            }
        }
        ContentValues values = new ContentValues();
        values.put("transfer_id", transferId);
        values.put("content_id", proposal.getContentId().toByteArray());
        values.put("fact_count", proposal.getFactCount());
        values.put("blob_count", proposal.getBlobCount());
        values.put("total_blob_bytes", proposal.getTotalBlobBytes());
        values.put("sender_device_id", proposal.getSenderDeviceId());
        values.put("sender_library_epoch", proposal.getSenderLibraryEpoch());
        values.put("receiver_device_id", proposal.getReceiverDeviceId());
        values.put("receiver_library_epoch", proposal.getReceiverLibraryEpoch());
        values.put("state", "proposed");
        database.insertOrThrow("framed_sync_android_transfers", null, values);
        return FramedSyncStageOutcome.CREATED;
    }

    private TransferProposal loadProposal(byte[] transferId) {
        try (Cursor row = database.query("framed_sync_android_transfers", null, "hex(transfer_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId), null, null, null)) {
            return row.moveToFirst() ? proposal(row) : null;
        }
    }

    private void requireProposed(byte[] transferId) throws FramedSyncValidationException {
        try (Cursor row = database.query("framed_sync_android_transfers",
            new String[] {"state", "active_attempt_id"}, "hex(transfer_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId), null, null, null)) {
            if (!row.moveToFirst() || !"proposed".equals(row.getString(0)) || !row.isNull(1)) {
                throw invalid("inbound_active_attempt_conflict");
            }
        }
    }

    private boolean attemptExists(byte[] transferId, byte[] attemptId) {
        try (Cursor row = database.query("framed_sync_android_attempts", new String[] {"1"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null, null)) {
            return row.moveToFirst();
        }
    }

    private static TransferProposal proposal(Cursor row) {
        return TransferProposal.newBuilder()
            .setTransferId(com.google.protobuf.ByteString.copyFrom(row.getBlob(row.getColumnIndexOrThrow("transfer_id"))))
            .setContentId(com.google.protobuf.ByteString.copyFrom(row.getBlob(row.getColumnIndexOrThrow("content_id"))))
            .setFactCount(row.getLong(row.getColumnIndexOrThrow("fact_count")))
            .setBlobCount(row.getLong(row.getColumnIndexOrThrow("blob_count")))
            .setTotalBlobBytes(row.getLong(row.getColumnIndexOrThrow("total_blob_bytes")))
            .setSenderDeviceId(row.getString(row.getColumnIndexOrThrow("sender_device_id")))
            .setSenderLibraryEpoch(row.getString(row.getColumnIndexOrThrow("sender_library_epoch")))
            .setReceiverDeviceId(row.getString(row.getColumnIndexOrThrow("receiver_device_id")))
            .setReceiverLibraryEpoch(row.getString(row.getColumnIndexOrThrow("receiver_library_epoch"))).build();
    }

    static void requireIdentities(byte[] transferId, byte[] attemptId)
        throws FramedSyncValidationException {
        if (transferId.length != FramedSyncContract.DIGEST_BYTES ||
            attemptId.length != FramedSyncContract.IDENTIFIER_BYTES) {
            throw invalid("framed_sync_stage_identity_invalid");
        }
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
