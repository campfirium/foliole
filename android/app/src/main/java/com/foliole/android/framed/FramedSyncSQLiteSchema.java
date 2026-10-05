package com.foliole.android.framed;

import android.database.sqlite.SQLiteDatabase;

final class FramedSyncSQLiteSchema {
    private FramedSyncSQLiteSchema() {}

    static void install(SQLiteDatabase database) {
        database.execSQL("PRAGMA foreign_keys = ON");
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_transfers (" +
            "transfer_id BLOB PRIMARY KEY, content_id BLOB NOT NULL, fact_count INTEGER NOT NULL, " +
            "blob_count INTEGER NOT NULL, total_blob_bytes INTEGER NOT NULL, " +
            "sender_device_id TEXT NOT NULL, sender_library_epoch TEXT NOT NULL, " +
            "receiver_device_id TEXT NOT NULL, receiver_library_epoch TEXT NOT NULL, " +
            "active_attempt_id BLOB, state TEXT NOT NULL CHECK (state IN " +
            "('proposed','receiving','ready_to_apply','applied')))");
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_attempts (" +
            "transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, " +
            "state TEXT NOT NULL CHECK (state IN ('receiving','invalidated','promoted')), " +
            "PRIMARY KEY (transfer_id, attempt_id), FOREIGN KEY (transfer_id) REFERENCES " +
            "framed_sync_android_transfers(transfer_id) ON DELETE CASCADE)");
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_frames (" +
            "transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sequence TEXT NOT NULL, " +
            "frame_type INTEGER NOT NULL, preamble BLOB NOT NULL, frame_header BLOB NOT NULL, " +
            "ciphertext BLOB NOT NULL, authenticated_plaintext BLOB NOT NULL, " +
            "PRIMARY KEY (transfer_id, attempt_id, sequence), FOREIGN KEY (transfer_id, attempt_id) " +
            "REFERENCES framed_sync_android_attempts(transfer_id, attempt_id) ON DELETE CASCADE)");
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_facts (" +
            "transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, fact_kind INTEGER NOT NULL, " +
            "object_type TEXT NOT NULL, global_id TEXT NOT NULL, fact_id TEXT NOT NULL, " +
            "canonical_bytes BLOB NOT NULL, PRIMARY KEY " +
            "(transfer_id, attempt_id, fact_kind, object_type, global_id, fact_id), " +
            "FOREIGN KEY (transfer_id, attempt_id) REFERENCES framed_sync_android_attempts" +
            "(transfer_id, attempt_id) ON DELETE CASCADE)");
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_blob_offers (" +
            "transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sha256 BLOB NOT NULL, " +
            "byte_length INTEGER NOT NULL, role INTEGER NOT NULL, required INTEGER NOT NULL, " +
            "PRIMARY KEY (transfer_id, attempt_id, sha256), FOREIGN KEY (transfer_id, attempt_id) " +
            "REFERENCES framed_sync_android_attempts(transfer_id, attempt_id) ON DELETE CASCADE)");
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_blob_chunks (" +
            "transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sha256 BLOB NOT NULL, " +
            "byte_offset INTEGER NOT NULL, data BLOB NOT NULL, " +
            "PRIMARY KEY (transfer_id, attempt_id, sha256, byte_offset), " +
            "FOREIGN KEY (transfer_id, attempt_id) REFERENCES framed_sync_android_attempts" +
            "(transfer_id, attempt_id) ON DELETE CASCADE)");
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_available_blobs (" +
            "sha256 BLOB PRIMARY KEY, byte_length INTEGER NOT NULL, data BLOB NOT NULL)");
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_blob_pins (" +
            "transfer_id BLOB NOT NULL, sha256 BLOB NOT NULL, byte_length INTEGER NOT NULL, " +
            "role INTEGER NOT NULL, required INTEGER NOT NULL, PRIMARY KEY (transfer_id, sha256), " +
            "FOREIGN KEY (transfer_id) REFERENCES framed_sync_android_transfers(transfer_id) " +
            "ON DELETE CASCADE, FOREIGN KEY (sha256) REFERENCES " +
            "framed_sync_android_available_blobs(sha256))");
        installResources(database);
        installReceipts(database);
    }

    private static void installResources(SQLiteDatabase database) {
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_resource_blob_chunks (" +
            "transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sha256 BLOB NOT NULL, " +
            "byte_offset INTEGER NOT NULL, byte_length INTEGER NOT NULL, chunk_sha256 BLOB NOT NULL, " +
            "PRIMARY KEY (transfer_id, attempt_id, sha256, byte_offset), " +
            "FOREIGN KEY (transfer_id, attempt_id) REFERENCES framed_sync_android_attempts" +
            "(transfer_id, attempt_id) ON DELETE CASCADE)");
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_available_resources (" +
            "sha256 BLOB PRIMARY KEY, byte_length INTEGER NOT NULL, storage_key TEXT NOT NULL)");
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_resource_pins (" +
            "transfer_id BLOB NOT NULL, sha256 BLOB NOT NULL, byte_length INTEGER NOT NULL, " +
            "role INTEGER NOT NULL, required INTEGER NOT NULL, storage_key TEXT NOT NULL, " +
            "PRIMARY KEY (transfer_id, sha256), FOREIGN KEY (transfer_id) REFERENCES " +
            "framed_sync_android_transfers(transfer_id) ON DELETE CASCADE, FOREIGN KEY (sha256) " +
            "REFERENCES framed_sync_android_available_resources(sha256))");
    }

    private static void installReceipts(SQLiteDatabase database) {
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_receipts (" +
            "transfer_id BLOB PRIMARY KEY, content_id BLOB NOT NULL, receiver_device_id TEXT NOT NULL, " +
            "receiver_library_epoch TEXT NOT NULL, applied_state_hash BLOB NOT NULL)");
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_receipt_attempts (" +
            "transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, preamble BLOB NOT NULL, " +
            "state TEXT NOT NULL CHECK (state IN ('prepared','replayable')), " +
            "PRIMARY KEY (transfer_id, attempt_id), FOREIGN KEY (transfer_id) REFERENCES " +
            "framed_sync_android_receipts(transfer_id) ON DELETE CASCADE)");
        database.execSQL("CREATE TABLE IF NOT EXISTS framed_sync_android_receipt_frames (" +
            "transfer_id BLOB NOT NULL, attempt_id BLOB NOT NULL, sequence TEXT NOT NULL, " +
            "frame_header BLOB NOT NULL, ciphertext BLOB NOT NULL, authenticated_plaintext BLOB NOT NULL, " +
            "PRIMARY KEY (transfer_id, attempt_id, sequence), FOREIGN KEY (transfer_id, attempt_id) " +
            "REFERENCES framed_sync_android_receipt_attempts(transfer_id, attempt_id) ON DELETE CASCADE)");
    }
}
