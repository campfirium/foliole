package com.foliole.android.framed;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class FramedSyncSQLiteChunkedBodies {
    private static final String AVAILABLE = "framed_sync_android_available_blobs";
    private static final String CHUNKS = "framed_sync_android_available_blob_chunks";
    private final SQLiteDatabase database;

    FramedSyncSQLiteChunkedBodies(SQLiteDatabase database) {
        this.database = database;
    }

    FramedSyncBodyChunkStream.Result verifyAndPromote(
        byte[] transferId, byte[] attemptId, byte[] hash, long length
    ) throws Exception {
        if (!database.inTransaction()) throw new IllegalStateException("blob_promotion_transaction_required");
        if (hasAvailableHeader(hash, length)) {
            FramedSyncBodyChunkStream.Result result = FramedSyncBodyChunkStream.verify(
                availableSource(hash), length, hash, true);
            return result == FramedSyncBodyChunkStream.Result.VERIFIED ? result :
                FramedSyncBodyChunkStream.Result.INVALID;
        }
        FramedSyncBodyChunkStream.Source source = receivingSource(transferId, attemptId, hash);
        FramedSyncBodyChunkStream.Result result = FramedSyncBodyChunkStream.verify(source, length, hash, false);
        if (result != FramedSyncBodyChunkStream.Result.VERIFIED) return result;
        ContentValues header = new ContentValues();
        header.put("sha256", hash);
        header.put("byte_length", length);
        database.insertOrThrow(AVAILABLE, null, header);
        FramedSyncBodyChunkStream.reblock(source, length, (offset, data) -> {
            ContentValues chunk = new ContentValues();
            chunk.put("sha256", hash);
            chunk.put("byte_offset", offset);
            chunk.put("data", data);
            database.insertOrThrow(CHUNKS, null, chunk);
        });
        return result;
    }

    private boolean hasAvailableHeader(byte[] hash, long length) throws FramedSyncValidationException {
        try (Cursor row = database.query(AVAILABLE, new String[] {"byte_length"}, "hex(sha256) = ?",
            FramedSyncSQLiteValues.blobArgs(hash), null, null, null, "1")) {
            if (!row.moveToFirst()) return false;
            if (row.getLong(0) != length) {
                throw new FramedSyncValidationException("blob_available_identity_conflict");
            }
            return true;
        }
    }

    private FramedSyncBodyChunkStream.Source availableSource(byte[] hash) {
        return lastStart -> readNext(CHUNKS, "hex(sha256) = ?" + after(lastStart),
            lastStart < 0 ? FramedSyncSQLiteValues.blobArgs(hash) :
                FramedSyncSQLiteValues.blobArgs(hash, lastStart));
    }

    private FramedSyncBodyChunkStream.Source receivingSource(
        byte[] transferId, byte[] attemptId, byte[] hash
    ) {
        return lastStart -> readNext("framed_sync_android_blob_chunks",
            "hex(transfer_id) = ? AND hex(attempt_id) = ? AND hex(sha256) = ?" + after(lastStart),
            lastStart < 0 ? FramedSyncSQLiteValues.blobArgs(transferId, attemptId, hash) :
                FramedSyncSQLiteValues.blobArgs(transferId, attemptId, hash, lastStart));
    }

    private static String after(long lastStart) {
        return lastStart < 0 ? "" : " AND byte_offset > ?";
    }

    private FramedSyncBodyChunkStream.Chunk readNext(String table, String where, String[] args)
        throws FramedSyncValidationException {
        String boundedData = "CASE WHEN typeof(data) = 'blob' AND length(data) BETWEEN 1 AND " +
            FramedSyncBodyChunkStream.CHUNK_BYTES + " THEN data ELSE NULL END";
        try (Cursor row = database.query(table, new String[] {"byte_offset", "length(data)", boundedData},
            where, args, null, null, "byte_offset", "1")) {
            if (!row.moveToFirst()) return null;
            if (row.isNull(2)) {
                return new FramedSyncBodyChunkStream.Chunk(row.getLong(0), null);
            }
            return new FramedSyncBodyChunkStream.Chunk(row.getLong(0), row.getBlob(2));
        }
    }
}
