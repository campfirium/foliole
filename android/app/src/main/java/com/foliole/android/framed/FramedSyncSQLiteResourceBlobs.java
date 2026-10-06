package com.foliole.android.framed;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.foliole.sync.v22.BlobChunk;
import com.foliole.sync.v22.BlobReference;
import java.io.File;
import java.io.RandomAccessFile;
import java.security.MessageDigest;
import java.util.Arrays;

final class FramedSyncSQLiteResourceBlobs {
    private final SQLiteDatabase database;
    private final File directory;

    FramedSyncSQLiteResourceBlobs(SQLiteDatabase database, File directory) {
        this.database = database;
        this.directory = directory;
    }

    FramedSyncStageOutcome stage(
        byte[] transferId, byte[] attemptId, BlobReference descriptor, BlobChunk chunk
    ) throws Exception {
        if (directory == null) throw invalid("resource_storage_unavailable");
        byte[] data = chunk.getData().toByteArray();
        validateChunk(descriptor.getByteLength(), chunk.getOffset(), data.length);
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(data);
        if (chunkMatches(transferId, attemptId, descriptor.getSha256().toByteArray(),
            chunk.getOffset(), data.length, digest)) return FramedSyncStageOutcome.IDENTICAL;
        directory.mkdirs();
        File partial = FramedSyncResourceFiles.partial(directory, transferId, attemptId,
            descriptor.getSha256().toByteArray());
        try (RandomAccessFile output = new RandomAccessFile(partial, "rw")) {
            output.seek(chunk.getOffset());
            output.write(data);
        }
        ContentValues values = new ContentValues();
        values.put("transfer_id", transferId);
        values.put("attempt_id", attemptId);
        values.put("sha256", descriptor.getSha256().toByteArray());
        values.put("byte_offset", chunk.getOffset());
        values.put("byte_length", data.length);
        values.put("chunk_sha256", digest);
        long inserted = database.insertWithOnConflict("framed_sync_android_resource_blob_chunks",
            null, values, SQLiteDatabase.CONFLICT_IGNORE);
        if (inserted < 0) throw invalid("blob_chunk_identity_conflict");
        return FramedSyncStageOutcome.CREATED;
    }

    boolean verifyAndPin(
        byte[] transferId, byte[] attemptId, byte[] hash, long length, int role, boolean required
    ) throws Exception {
        String stored = available(hash, length);
        if (stored != null && validFormal(stored, hash, length, role)) {
            pin(transferId, hash, length, role, required, stored);
            return true;
        }
        if (!complete(transferId, attemptId, hash, length)) return !required;
        File partial = FramedSyncResourceFiles.partial(directory, transferId, attemptId, hash);
        String storageKey = FramedSyncResourceFiles.verify(partial, hash, length, role);
        if (storageKey == null) return false;
        storeAvailable(hash, length, storageKey);
        pin(transferId, hash, length, role, required, storageKey);
        return true;
    }

    void cleanupAttempt(byte[] transferId, byte[] attemptId) {
        if (directory == null) return;
        try (Cursor rows = database.query("framed_sync_android_blob_offers", new String[] {"sha256"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND role NOT IN (1, 5)",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId), null, null, null)) {
            while (rows.moveToNext()) {
                FramedSyncResourceFiles.partial(directory, transferId, attemptId, rows.getBlob(0)).delete();
            }
        }
    }

    File directory() {
        return directory;
    }

    private boolean complete(byte[] transferId, byte[] attemptId, byte[] hash, long length) {
        long offset = 0;
        try (Cursor rows = database.query("framed_sync_android_resource_blob_chunks",
            new String[] {"byte_offset", "byte_length"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND hex(sha256) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId, hash), null, null, "byte_offset")) {
            while (rows.moveToNext()) {
                if (rows.getLong(0) != offset) return false;
                offset += rows.getLong(1);
            }
        }
        return offset == length;
    }

    private boolean chunkMatches(
        byte[] transferId, byte[] attemptId, byte[] hash, long offset, int length, byte[] digest
    ) throws FramedSyncValidationException {
        try (Cursor row = database.query("framed_sync_android_resource_blob_chunks",
            new String[] {"byte_length", "chunk_sha256"},
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND hex(sha256) = ? AND byte_offset = ?",
            FramedSyncSQLiteValues.blobArgs(transferId, attemptId, hash, offset), null, null, null)) {
            if (!row.moveToFirst()) return false;
            if (row.getLong(0) != length || !Arrays.equals(row.getBlob(1), digest)) {
                throw invalid("blob_chunk_identity_conflict");
            }
            return true;
        }
    }

    private String available(byte[] hash, long length) throws FramedSyncValidationException {
        try (Cursor row = database.query("framed_sync_android_available_resources",
            new String[] {"byte_length", "storage_key"}, "hex(sha256) = ?",
            FramedSyncSQLiteValues.blobArgs(hash), null, null, null)) {
            if (!row.moveToFirst()) return null;
            if (row.getLong(0) != length) throw invalid("resource_available_identity_conflict");
            return row.getString(1);
        }
    }

    private boolean validFormal(String key, byte[] hash, long length, int role) throws Exception {
        return directory != null && key.equals(FramedSyncResourceFiles.verify(
            new File(directory, key), hash, length, role));
    }

    private void storeAvailable(byte[] hash, long length, String key) throws Exception {
        ContentValues values = new ContentValues();
        values.put("sha256", hash);
        values.put("byte_length", length);
        values.put("storage_key", key);
        long inserted = database.insertWithOnConflict("framed_sync_android_available_resources",
            null, values, SQLiteDatabase.CONFLICT_IGNORE);
        if (inserted < 0 && !key.equals(available(hash, length))) {
            throw invalid("resource_available_identity_conflict");
        }
    }

    private void pin(byte[] transferId, byte[] hash, long length, int role, boolean required, String key)
        throws FramedSyncValidationException {
        ContentValues values = new ContentValues();
        values.put("transfer_id", transferId);
        values.put("sha256", hash);
        values.put("byte_length", length);
        values.put("role", role);
        values.put("required", required ? 1 : 0);
        values.put("storage_key", key);
        long inserted = database.insertWithOnConflict("framed_sync_android_resource_pins",
            null, values, SQLiteDatabase.CONFLICT_IGNORE);
        if (inserted < 0) throw invalid("resource_pin_identity_conflict");
    }

    private static void validateChunk(long total, long offset, int length)
        throws FramedSyncValidationException {
        if (offset < 0 || offset % FramedSyncContract.BLOB_CHUNK_BYTES != 0 ||
            length != Math.min(FramedSyncContract.BLOB_CHUNK_BYTES, total - offset)) {
            throw invalid("blob_chunk_range_invalid");
        }
    }

    private static FramedSyncValidationException invalid(String code) {
        return new FramedSyncValidationException(code);
    }
}
