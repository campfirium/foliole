package com.foliole.android.framed;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.foliole.sync.v22.FactRecord;
import com.foliole.sync.v22.TransferHeader;
import com.foliole.sync.v22.TransferProposal;
import com.foliole.sync.v22.TransferTrailer;
import java.io.File;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.List;

final class FramedSyncSQLiteInboundFrames {
    private final SQLiteDatabase database;
    private final FramedSyncSQLiteTransfers transfers;
    private final FramedSyncSQLiteFacts facts;
    private final FramedSyncSQLiteBlobs blobs;

    FramedSyncSQLiteInboundFrames(SQLiteDatabase database, File resourceDirectory) {
        this.database = database;
        transfers = new FramedSyncSQLiteTransfers(database);
        facts = new FramedSyncSQLiteFacts(database, transfers);
        blobs = new FramedSyncSQLiteBlobs(database, resourceDirectory);
    }

    FramedSyncStageOutcome admit(TransferProposal proposal) throws Exception {
        return transfers.admit(proposal);
    }

    FramedSyncStageOutcome commit(
        FramedSyncAuthenticatedFrame frame,
        FramedSyncValidatedMessage message
    ) throws Exception {
        FramedSyncSQLiteTransfers.requireIdentities(frame.transferId(), frame.attemptId());
        FramedSyncWireHeader wireHeader = FramedSyncWireHeader.decode(frame.frameHeader());
        String deferredError = null;
        FramedSyncStageOutcome outcome;
        database.beginTransaction();
        try {
            FramedSyncStageOutcome existing = existingFrame(frame, wireHeader, message);
            if (existing != null) {
                database.setTransactionSuccessful();
                return existing;
            }
            preparePayload(frame, message);
            insertFrame(frame, wireHeader, message);
            if (message.payload().payloadCase() == FramedSyncPayload.Case.FACT) {
                facts.stage(frame, (FactRecord) message.payload().value());
            } else if (message.payload().payloadCase() == FramedSyncPayload.Case.BLOB_CHUNK) {
                blobs.stageChunk(frame.transferId(), frame.attemptId(),
                    (com.foliole.sync.v22.BlobChunk) message.payload().value());
            } else if (message.payload().payloadCase() == FramedSyncPayload.Case.TRANSFER_TRAILER) {
                deferredError = finalizeAttempt(frame, (TransferTrailer) message.payload().value());
            }
            outcome = FramedSyncStageOutcome.CREATED;
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        if (deferredError != null) throw invalid(deferredError);
        return outcome;
    }

    void invalidate(byte[] transferId, byte[] attemptId) throws Exception {
        blobs.cleanupAttempt(transferId, attemptId);
        transfers.invalidate(transferId, attemptId);
    }

    FramedSyncResourcePublication publishResources(byte[] transferId) throws Exception {
        return new FramedSyncResourcePublication(database, blobs.resourceDirectory(), transferId);
    }

    private void preparePayload(
        FramedSyncAuthenticatedFrame frame,
        FramedSyncValidatedMessage message
    ) throws Exception {
        if (message.payload().payloadCase() == FramedSyncPayload.Case.TRANSFER_HEADER) {
            TransferHeader header = (TransferHeader) message.payload().value();
            transfers.stageHeader(frame, header);
            blobs.stageOffers(frame.transferId(), frame.attemptId(), header);
            return;
        }
        if (message.payload().payloadCase() != FramedSyncPayload.Case.FACT &&
            message.payload().payloadCase() != FramedSyncPayload.Case.BLOB_CHUNK &&
            message.payload().payloadCase() != FramedSyncPayload.Case.TRANSFER_TRAILER) {
            throw invalid("transfer_frame_payload_required");
        }
        transfers.requireReceivingAttempt(frame.transferId(), frame.attemptId());
    }

    private String finalizeAttempt(FramedSyncAuthenticatedFrame frame, TransferTrailer trailer)
        throws Exception {
        TransferHeader header = transfers.loadHeader(frame.transferId(), frame.attemptId());
        List<FactRecord> storedFacts = facts.load(frame.transferId(), frame.attemptId());
        if (header == null || !framesAreContinuous(frame) || trailer.getFactCount() != storedFacts.size() ||
            trailer.getFactCount() != header.getManifest().getFactsCount() ||
            trailer.getBlobCount() != header.getManifest().getBlobsCount()) {
            clearAttempt(frame.transferId(), frame.attemptId());
            return "inbound_attempt_manifest_mismatch";
        }
        byte[] contentId = FramedSyncCanonicalManifest.contentId(
            storedFacts, header.getManifest().getBlobsList());
        if (!Arrays.equals(contentId, trailer.getManifestHash().toByteArray()) ||
            !Arrays.equals(contentId, header.getManifest().getContentId().toByteArray()) ||
            !blobs.verifyAndPromote(frame.transferId(), frame.attemptId())) {
            clearAttempt(frame.transferId(), frame.attemptId());
            return "inbound_attempt_manifest_mismatch";
        }
        transfers.promote(frame.transferId(), frame.attemptId());
        return null;
    }

    private void clearAttempt(byte[] transferId, byte[] attemptId) {
        blobs.cleanupAttempt(transferId, attemptId);
        transfers.clearAttempt(transferId, attemptId);
    }

    private boolean framesAreContinuous(FramedSyncAuthenticatedFrame frame) {
        long expected = 0;
        try (Cursor rows = database.query("framed_sync_android_frames", new String[] {"sequence"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(frame.transferId(), frame.attemptId()),
            null, null, "length(sequence), sequence")) {
            while (rows.moveToNext()) {
                if (!Long.toUnsignedString(expected).equals(rows.getString(0))) return false;
                expected += 1;
            }
        }
        return Long.toUnsignedString(expected - 1).equals(
            Long.toUnsignedString(FramedSyncWireHeader.decode(frame.frameHeader()).sequence()));
    }

    private FramedSyncStageOutcome existingFrame(
        FramedSyncAuthenticatedFrame frame,
        FramedSyncWireHeader header,
        FramedSyncValidatedMessage message
    ) throws FramedSyncValidationException {
        try (Cursor row = database.query("framed_sync_android_frames",
            new String[] {"frame_type", "preamble", "frame_header", "ciphertext", "authenticated_plaintext"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND sequence = ?",
            FramedSyncSQLiteValues.blobArgs(frame.transferId(), frame.attemptId(),
                Long.toUnsignedString(header.sequence())), null, null, null)) {
            if (!row.moveToFirst()) return null;
            byte[][] identities = storedBodyIdentities(frame, message);
            boolean same = row.getInt(0) == header.frameType() && Arrays.equals(row.getBlob(1), frame.preamble()) &&
                Arrays.equals(row.getBlob(2), frame.frameHeader()) &&
                Arrays.equals(row.getBlob(3), identities[0]) && Arrays.equals(row.getBlob(4), identities[1]);
            if (!same) throw invalid("inbound_frame_identity_conflict");
            return FramedSyncStageOutcome.IDENTICAL;
        }
    }

    private void insertFrame(
        FramedSyncAuthenticatedFrame frame,
        FramedSyncWireHeader header,
        FramedSyncValidatedMessage message
    ) {
        byte[][] identities = storedBodyIdentities(frame, message);
        ContentValues values = new ContentValues();
        values.put("transfer_id", frame.transferId());
        values.put("attempt_id", frame.attemptId());
        values.put("sequence", Long.toUnsignedString(header.sequence()));
        values.put("frame_type", header.frameType());
        values.put("preamble", frame.preamble());
        values.put("frame_header", frame.frameHeader());
        values.put("ciphertext", identities[0]);
        values.put("authenticated_plaintext", identities[1]);
        database.insertOrThrow("framed_sync_android_frames", null, values);
    }

    private byte[][] storedBodyIdentities(
        FramedSyncAuthenticatedFrame frame,
        FramedSyncValidatedMessage message
    ) {
        if (message.payload().payloadCase() != FramedSyncPayload.Case.BLOB_CHUNK) {
            return new byte[][] {frame.ciphertext(), frame.plaintext()};
        }
        com.foliole.sync.v22.BlobChunk chunk =
            (com.foliole.sync.v22.BlobChunk) message.payload().value();
        if (!blobs.isResourceChunk(frame.transferId(), frame.attemptId(),
            chunk.getBlobHash().toByteArray())) {
            return new byte[][] {frame.ciphertext(), frame.plaintext()};
        }
        return new byte[][] {sha256(frame.ciphertext()), sha256(frame.plaintext())};
    }

    private static byte[] sha256(byte[] value) {
        try { return MessageDigest.getInstance("SHA-256").digest(value); }
        catch (Exception error) { throw new IllegalStateException(error); }
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
