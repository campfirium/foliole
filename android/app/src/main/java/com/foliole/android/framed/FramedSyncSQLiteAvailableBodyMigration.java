package com.foliole.android.framed;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class FramedSyncSQLiteAvailableBodyMigration {
    private static final int CHUNK_BYTES = 512 * 1024;
    private static final String OLD_AVAILABLE = "framed_sync_android_available_blobs_continuous_upgrade";

    private FramedSyncSQLiteAvailableBodyMigration() {}

    static void migrateChunkedAvailableBodies(SQLiteDatabase database) throws Exception {
        int version = database.getVersion();
        if (version < 1) throw new FramedSyncValidationException("framed_sync_digest_migration_required");
        if (version >= 2) return;
        database.beginTransaction();
        try {
            for (String statement : REBUILD_STATEMENTS) database.execSQL(statement);
            copyAndVerify(database);
            database.execSQL("DROP TABLE framed_sync_android_blob_pins_continuous_upgrade");
            database.execSQL("DROP TABLE " + OLD_AVAILABLE);
            database.setVersion(2);
            database.setTransactionSuccessful();
        } finally { database.endTransaction(); }
    }

    private static void copyAndVerify(SQLiteDatabase database) throws Exception {
        Long after = null;
        FramedSyncSQLiteChunkedBodies verifier = new FramedSyncSQLiteChunkedBodies(database);
        while (true) {
            SourceRow row = next(database, after);
            if (row == null) return;
            if (row.hash == null || row.hash.length != 32 || row.length < 0 ||
                row.size != row.length || !"blob".equals(row.type)) {
                throw new FramedSyncValidationException("blob_available_identity_conflict");
            }
            for (long offset = 0; offset < row.length; offset += CHUNK_BYTES) {
                database.execSQL("INSERT INTO framed_sync_android_available_blob_chunks " +
                    "(sha256, byte_offset, data) SELECT sha256, ?, substr(data, ?, ?) FROM " +
                    OLD_AVAILABLE + " WHERE rowid = ?",
                    new Object[] {offset, offset + 1, Math.min(CHUNK_BYTES, row.length - offset), row.id});
            }
            if (verifier.verifyAndPromote(new byte[0], new byte[0], row.hash, row.length) !=
                FramedSyncBodyChunkStream.Result.VERIFIED) {
                throw new FramedSyncValidationException("inbound_attempt_manifest_mismatch");
            }
            after = row.id;
        }
    }

    private static SourceRow next(SQLiteDatabase database, Long after) {
        String where = after == null ? "" : " WHERE rowid > ?";
        String[] args = after == null ? null : new String[] {Long.toString(after)};
        try (Cursor row = database.rawQuery("SELECT rowid, sha256, byte_length, length(data), typeof(data) FROM " +
            OLD_AVAILABLE + where + " ORDER BY rowid LIMIT 1", args)) {
            if (!row.moveToFirst()) return null;
            return new SourceRow(row.getLong(0), row.getBlob(1), row.getLong(2), row.getLong(3), row.getString(4));
        }
    }

    private static final class SourceRow {
        final long id;
        final byte[] hash;
        final long length;
        final long size;
        final String type;

        SourceRow(long id, byte[] hash, long length, long size, String type) {
            this.id = id;
            this.hash = hash;
            this.length = length;
            this.size = size;
            this.type = type;
        }
    }

    private static final String[] REBUILD_STATEMENTS = {
        "ALTER TABLE framed_sync_android_blob_pins RENAME TO framed_sync_android_blob_pins_continuous_upgrade",
        "ALTER TABLE framed_sync_android_available_blobs RENAME TO " + OLD_AVAILABLE,
        "CREATE TABLE framed_sync_android_available_blobs (sha256 BLOB PRIMARY KEY, byte_length INTEGER NOT NULL)",
        "INSERT INTO framed_sync_android_available_blobs (sha256, byte_length) SELECT sha256, byte_length FROM " + OLD_AVAILABLE,
        "CREATE TABLE framed_sync_android_blob_pins (transfer_id BLOB NOT NULL, sha256 BLOB NOT NULL, " +
            "byte_length INTEGER NOT NULL, role INTEGER NOT NULL, required INTEGER NOT NULL, " +
            "PRIMARY KEY (transfer_id, sha256), FOREIGN KEY (transfer_id) REFERENCES " +
            "framed_sync_android_transfers(transfer_id) ON DELETE CASCADE, " +
            "FOREIGN KEY (sha256) REFERENCES framed_sync_android_available_blobs(sha256))",
        "INSERT INTO framed_sync_android_blob_pins (transfer_id, sha256, byte_length, role, required) " +
            "SELECT transfer_id, sha256, byte_length, role, required FROM framed_sync_android_blob_pins_continuous_upgrade",
        "CREATE TABLE framed_sync_android_available_blob_chunks (sha256 BLOB NOT NULL REFERENCES " +
            "framed_sync_android_available_blobs(sha256) ON DELETE CASCADE, byte_offset INTEGER NOT NULL " +
            "CHECK (byte_offset >= 0 AND byte_offset % " + CHUNK_BYTES + " = 0), data BLOB NOT NULL " +
            "CHECK (typeof(data) = 'blob' AND length(data) BETWEEN 1 AND " + CHUNK_BYTES + "), " +
            "PRIMARY KEY (sha256, byte_offset))"
    };
}
