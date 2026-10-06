package com.foliole.android.framed;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class FramedSyncResourcePublication implements AutoCloseable {
    private final List<File> created = new ArrayList<>();
    private final List<File> partials = new ArrayList<>();
    private final List<String> storageKeys = new ArrayList<>();
    private boolean committed;

    FramedSyncResourcePublication(
        SQLiteDatabase database, File directory, byte[] transferId
    ) throws Exception {
        if (directory == null) throw new FramedSyncValidationException("resource_storage_unavailable");
        directory.mkdirs();
        byte[] attemptId = activeAttempt(database, transferId);
        try (Cursor rows = database.query("framed_sync_android_resource_pins",
            new String[] {"sha256", "byte_length", "role", "storage_key"},
            "hex(transfer_id) = ?", FramedSyncSQLiteValues.blobArgs(transferId),
            null, null, "storage_key")) {
            while (rows.moveToNext()) publish(directory, transferId, attemptId, rows);
        } catch (Exception error) {
            rollback();
            throw error;
        }
    }

    public List<String> storageKeys() {
        return Collections.unmodifiableList(storageKeys);
    }

    public void commit() {
        committed = true;
        for (File partial : partials) partial.delete();
    }

    @Override
    public void close() {
        if (!committed) rollback();
    }

    private void publish(File directory, byte[] transferId, byte[] attemptId, Cursor row)
        throws Exception {
        byte[] hash = row.getBlob(0);
        long length = row.getLong(1);
        int role = row.getInt(2);
        String key = row.getString(3);
        File target = new File(directory, key);
        File partial = FramedSyncResourceFiles.partial(directory, transferId, attemptId, hash);
        if (target.exists()) {
            requireValid(target, hash, length, role, key);
        } else {
            requireValid(partial, hash, length, role, key);
            File publication = FramedSyncResourceFiles.publication(
                directory, transferId, attemptId, hash);
            if (FramedSyncResourceFiles.copyForPublication(partial, target, publication)) {
                requireValid(target, hash, length, role, key);
                created.add(target);
            } else {
                requireValid(target, hash, length, role, key);
            }
        }
        storageKeys.add(key);
        if (partial.exists()) partials.add(partial);
    }

    private static void requireValid(File file, byte[] hash, long length, int role, String key)
        throws Exception {
        if (!key.equals(FramedSyncResourceFiles.verify(file, hash, length, role))) {
            throw new FramedSyncValidationException("resource_file_identity_conflict");
        }
    }

    private void rollback() {
        for (File file : created) file.delete();
        created.clear();
    }

    private static byte[] activeAttempt(SQLiteDatabase database, byte[] transferId)
        throws FramedSyncValidationException {
        try (Cursor row = database.query("framed_sync_android_transfers",
            new String[] {"active_attempt_id"}, "hex(transfer_id) = ?",
            FramedSyncSQLiteValues.blobArgs(transferId), null, null, null)) {
            if (!row.moveToFirst() || row.isNull(0)) {
                throw new FramedSyncValidationException("framed_sync_transfer_not_ready");
            }
            return row.getBlob(0);
        }
    }
}
