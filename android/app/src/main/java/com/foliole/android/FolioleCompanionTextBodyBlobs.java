package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class FolioleCompanionTextBodyBlobs {

    private FolioleCompanionTextBodyBlobs() {}

    static String upsert(SQLiteDatabase database, String content, String now) throws Exception {
        if (!tableExists(database, "content_blobs") || !tableExists(database, "content_blob_data")) {
            return null;
        }
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        String hash = sha256(bytes);
        ContentValues blob = new ContentValues();
        blob.put("hash", hash);
        blob.put("storage_key", "text/" + hash);
        blob.put("kind", "text_body");
        blob.put("mime_type", "text/plain");
        blob.put("compression", "none");
        blob.put("original_size_bytes", bytes.length);
        blob.put("stored_size_bytes", bytes.length);
        blob.put("original_sha256", hash);
        blob.put("stored_sha256", hash);
        blob.put("availability", "local");
        blob.put("created_at", now);
        blob.put("cached_at", now);
        blob.put("last_verified_at", now);
        database.insertWithOnConflict("content_blobs", null, blob, SQLiteDatabase.CONFLICT_IGNORE);

        ContentValues data = new ContentValues();
        data.put("hash", hash);
        data.put("data", bytes);
        database.insertWithOnConflict("content_blob_data", null, data, SQLiteDatabase.CONFLICT_IGNORE);
        return hash;
    }

    private static boolean tableExists(SQLiteDatabase database, String tableName) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            new String[] { tableName }
        )) {
            return cursor.moveToFirst();
        }
    }

    private static String sha256(byte[] bytes) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder builder = new StringBuilder();
        for (byte value : hash) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }
}
