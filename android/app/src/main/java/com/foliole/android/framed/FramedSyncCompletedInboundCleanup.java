package com.foliole.android.framed;

import android.database.sqlite.SQLiteDatabase;

final class FramedSyncCompletedInboundCleanup {
    private FramedSyncCompletedInboundCleanup() {}

    static void migratePayloads(SQLiteDatabase database) {
        if (database.getVersion() >= 1) return;
        database.beginTransaction();
        try {
            try (var rows = database.rawQuery("SELECT rowid, frame_type, ciphertext, " +
                "length(authenticated_plaintext) FROM framed_sync_android_frames", null)) {
                while (rows.moveToNext()) {
                    // Resource chunks already contain two digests; a full blob message is larger than 32 bytes.
                    if (rows.getInt(1) == 4 && rows.getInt(3) == 32) continue;
                    byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(rows.getBlob(2));
                    database.execSQL("UPDATE framed_sync_android_frames SET ciphertext = ? WHERE rowid = ?",
                        new Object[] {digest, rows.getLong(0)});
                }
            }
            database.setVersion(1);
            database.setTransactionSuccessful();
        } catch (java.security.NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        } finally { database.endTransaction(); }
    }

    static void recover(SQLiteDatabase database) {
        java.util.List<byte[]> ready = new java.util.ArrayList<>();
        try (var rows = database.rawQuery("SELECT transfer_id FROM framed_sync_android_transfers WHERE state = 'ready_to_apply'", null)) {
            while (rows.moveToNext()) ready.add(rows.getBlob(0));
        }
        for (byte[] transferId : ready) retireReadyCopies(database, transferId);
        java.util.List<byte[]> completed = new java.util.ArrayList<>();
        try (var rows = database.rawQuery("SELECT transfer_id FROM framed_sync_android_receipts", null)) {
            while (rows.moveToNext()) completed.add(rows.getBlob(0));
        }
        for (byte[] transferId : completed) retire(database, transferId);
    }

    static void retireReadyCopies(SQLiteDatabase database, byte[] transferId) {
        String[] args = FramedSyncSQLiteValues.blobArgs(transferId);
        database.execSQL("DELETE FROM framed_sync_android_facts WHERE hex(transfer_id) = ?", args);
        database.execSQL("DELETE FROM framed_sync_android_blob_chunks WHERE hex(transfer_id) = ?", args);
        try (var rows = database.rawQuery("SELECT rowid, authenticated_plaintext FROM framed_sync_android_frames " +
            "WHERE hex(transfer_id) = ? AND frame_type = 4 AND length(authenticated_plaintext) != 32", args)) {
            while (rows.moveToNext()) {
                byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(rows.getBlob(1));
                database.execSQL("UPDATE framed_sync_android_frames SET authenticated_plaintext = ? WHERE rowid = ?",
                    new Object[] {digest, rows.getLong(0)});
            }
        } catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }

    static void retire(SQLiteDatabase database, byte[] transferId) {
        String[] args = FramedSyncSQLiteValues.blobArgs(transferId);
        database.beginTransaction();
        try {
            try (var row = database.rawQuery("SELECT 1 FROM framed_sync_android_receipts WHERE hex(transfer_id) = ?", args)) {
                if (!row.moveToFirst()) throw new IllegalStateException("framed_sync_cleanup_receipt_missing");
            }
            database.execSQL("DELETE FROM framed_sync_android_blob_pins WHERE hex(transfer_id) = ?", args);
            database.execSQL("DELETE FROM framed_sync_android_resource_pins WHERE hex(transfer_id) = ?", args);
            database.execSQL("DELETE FROM framed_sync_android_available_blobs WHERE sha256 IN " +
                "(SELECT sha256 FROM framed_sync_android_blob_offers WHERE hex(transfer_id) = ?) AND NOT EXISTS " +
                "(SELECT 1 FROM framed_sync_android_blob_pins p WHERE p.sha256 = framed_sync_android_available_blobs.sha256)", args);
            database.execSQL("DELETE FROM framed_sync_android_available_resources WHERE sha256 IN " +
                "(SELECT sha256 FROM framed_sync_android_blob_offers WHERE hex(transfer_id) = ?) AND NOT EXISTS " +
                "(SELECT 1 FROM framed_sync_android_resource_pins p WHERE p.sha256 = framed_sync_android_available_resources.sha256)", args);
            database.execSQL("DELETE FROM framed_sync_android_transfers WHERE hex(transfer_id) = ?", args);
            database.execSQL("DELETE FROM framed_sync_android_receipts WHERE hex(transfer_id) = ?", args);
            database.setTransactionSuccessful();
        } finally { database.endTransaction(); }
    }
}
