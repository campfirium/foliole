package com.foliole.android.framed;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.foliole.sync.v22.BlobChunk;
import com.foliole.sync.v22.BlobReference;
import com.foliole.sync.v22.TransferHeader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.security.MessageDigest;
import java.util.Arrays;

final class FramedSyncSQLiteBlobs {
    private final SQLiteDatabase database;
    private final FramedSyncSQLiteResourceBlobs resources;

    FramedSyncSQLiteBlobs(SQLiteDatabase database, File resourceDirectory) {
        this.database = database;
        resources = new FramedSyncSQLiteResourceBlobs(database, resourceDirectory);
    }

    void stageOffers(byte[] transferId, byte[] attemptId, TransferHeader header)
        throws FramedSyncValidationException {
        for (BlobReference blob : header.getManifest().getBlobsList()) {
            ContentValues values = new ContentValues();
            values.put("transfer_id", transferId);
            values.put("attempt_id", attemptId);
            values.put("sha256", blob.getSha256().toByteArray());
            values.put("byte_length", blob.getByteLength());
            values.put("role", blob.getRoleValue());
            values.put("required", blob.getRequired() ? 1 : 0);
            long inserted = database.insertWithOnConflict(
                "framed_sync_android_blob_offers", null, values, SQLiteDatabase.CONFLICT_IGNORE);
            if (inserted < 0 && !offerMatches(transferId, attemptId, blob)) {
                throw invalid("blob_offer_identity_conflict");
            }
        }
    }

    FramedSyncStageOutcome stageChunk(byte[] transferId, byte[] attemptId, BlobChunk chunk)
        throws Exception {
        BlobReference descriptor = loadOffer(transferId, attemptId, chunk.getBlobHash().toByteArray());
        if (descriptor == null) throw invalid("blob_chunk_not_admitted");
        if (descriptor.getRoleValue() != 1) {
            return resources.stage(transferId, attemptId, descriptor, chunk);
        }
        long length = chunk.getData().size();
        if (chunk.getOffset() < 0 || chunk.getOffset() > descriptor.getByteLength() - length) {
            throw invalid("blob_chunk_range_invalid");
        }
        ContentValues values = new ContentValues();
        values.put("transfer_id", transferId);
        values.put("attempt_id", attemptId);
        values.put("sha256", chunk.getBlobHash().toByteArray());
        values.put("byte_offset", chunk.getOffset());
        values.put("data", chunk.getData().toByteArray());
        long inserted = database.insertWithOnConflict(
            "framed_sync_android_blob_chunks", null, values, SQLiteDatabase.CONFLICT_IGNORE);
        if (inserted >= 0) return FramedSyncStageOutcome.CREATED;
        if (!chunkMatches(transferId, attemptId, chunk)) {
            throw invalid("blob_chunk_identity_conflict");
        }
        return FramedSyncStageOutcome.IDENTICAL;
    }

    boolean verifyAndPromote(byte[] transferId, byte[] attemptId) throws Exception {
        try (Cursor offers = database.query(
            "framed_sync_android_blob_offers",
            new String[] {"sha256", "byte_length", "role", "required"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null, null
        )) {
            while (offers.moveToNext()) {
                byte[] hash = offers.getBlob(0);
                long byteLength = offers.getLong(1);
                int role = offers.getInt(2);
                boolean required = offers.getInt(3) == 1;
                if (role != 1) {
                    if (!resources.verifyAndPin(
                        transferId, attemptId, hash, byteLength, role, required)) return false;
                    continue;
                }
                byte[] data = available(hash, byteLength);
                if (data == null) data = assemble(transferId, attemptId, hash, byteLength);
                if (data == null) {
                    if (required) return false;
                    continue;
                }
                if (!Arrays.equals(hash, sha256(data))) return false;
                storeAvailable(hash, byteLength, data);
                pin(transferId, hash, byteLength, role, required);
            }
        }
        return true;
    }

    void cleanupAttempt(byte[] transferId, byte[] attemptId) {
        resources.cleanupAttempt(transferId, attemptId);
    }

    File resourceDirectory() {
        return resources.directory();
    }

    boolean isResourceChunk(byte[] transferId, byte[] attemptId, byte[] hash) {
        BlobReference descriptor = loadOffer(transferId, attemptId, hash);
        return descriptor != null && descriptor.getRoleValue() != 1;
    }

    private byte[] assemble(byte[] transferId, byte[] attemptId, byte[] hash, long byteLength)
        throws FramedSyncValidationException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        long expectedOffset = 0;
        try (Cursor chunks = database.query(
            "framed_sync_android_blob_chunks", new String[] {"byte_offset", "data"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND hex(sha256) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId, hash), null, null, "byte_offset"
        )) {
            while (chunks.moveToNext()) {
                if (chunks.getLong(0) != expectedOffset) return null;
                byte[] data = chunks.getBlob(1);
                output.write(data, 0, data.length);
                expectedOffset += data.length;
            }
        }
        return expectedOffset == byteLength ? output.toByteArray() : null;
    }

    private byte[] available(byte[] hash, long byteLength) throws FramedSyncValidationException {
        try (Cursor row = database.query("framed_sync_android_available_blobs",
            new String[] {"byte_length", "data"}, "hex(sha256) = ?",
            FramedSyncSQLiteValues.blobArgs(hash), null, null, null
        )) {
            if (!row.moveToFirst()) return null;
            if (row.getLong(0) != byteLength) throw invalid("blob_available_identity_conflict");
            return row.getBlob(1);
        }
    }

    private void storeAvailable(byte[] hash, long byteLength, byte[] data)
        throws FramedSyncValidationException {
        ContentValues values = new ContentValues();
        values.put("sha256", hash);
        values.put("byte_length", byteLength);
        values.put("data", data);
        long inserted = database.insertWithOnConflict(
            "framed_sync_android_available_blobs", null, values, SQLiteDatabase.CONFLICT_IGNORE);
        if (inserted < 0 && !Arrays.equals(data, available(hash, byteLength))) {
            throw invalid("blob_available_identity_conflict");
        }
    }

    private void pin(byte[] transferId, byte[] hash, long length, int role, boolean required)
        throws FramedSyncValidationException {
        ContentValues values = new ContentValues();
        values.put("transfer_id", transferId);
        values.put("sha256", hash);
        values.put("byte_length", length);
        values.put("role", role);
        values.put("required", required ? 1 : 0);
        long inserted = database.insertWithOnConflict(
            "framed_sync_android_blob_pins", null, values, SQLiteDatabase.CONFLICT_IGNORE);
        if (inserted < 0 && !pinMatches(transferId, hash, length, role, required)) {
            throw invalid("blob_pin_identity_conflict");
        }
    }

    private BlobReference loadOffer(byte[] transferId, byte[] attemptId, byte[] hash) {
        try (Cursor row = database.query("framed_sync_android_blob_offers",
            new String[] {"byte_length", "role", "required"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND hex(sha256) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId, hash), null, null, null
        )) {
            if (!row.moveToFirst()) return null;
            return BlobReference.newBuilder().setSha256(com.google.protobuf.ByteString.copyFrom(hash))
                .setByteLength(row.getLong(0)).setRoleValue(row.getInt(1))
                .setRequired(row.getInt(2) == 1).build();
        }
    }

    private boolean offerMatches(byte[] transferId, byte[] attemptId, BlobReference blob) {
        BlobReference stored = loadOffer(transferId, attemptId, blob.getSha256().toByteArray());
        return stored != null && stored.equals(blob);
    }

    private boolean chunkMatches(byte[] transferId, byte[] attemptId, BlobChunk chunk) {
        try (Cursor row = database.query("framed_sync_android_blob_chunks", new String[] {"data"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND hex(sha256) = ? AND byte_offset = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId, chunk.getBlobHash().toByteArray(),
                chunk.getOffset()), null, null, null
        )) {
            return row.moveToFirst() && Arrays.equals(row.getBlob(0), chunk.getData().toByteArray());
        }
    }

    private boolean pinMatches(byte[] transferId, byte[] hash, long length, int role, boolean required) {
        try (Cursor row = database.query("framed_sync_android_blob_pins",
            new String[] {"byte_length", "role", "required"},
            "hex(transfer_id) = ? AND hex(sha256) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, hash), null, null, null
        )) {
            return row.moveToFirst() && row.getLong(0) == length && row.getInt(1) == role &&
                row.getInt(2) == (required ? 1 : 0);
        }
    }

    private static byte[] sha256(byte[] data) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(data);
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
