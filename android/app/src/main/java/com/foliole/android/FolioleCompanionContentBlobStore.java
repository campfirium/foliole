package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.security.MessageDigest;
import java.time.Instant;

final class FolioleCompanionContentBlobStore {
    private FolioleCompanionContentBlobStore() {}

    static JSObject loadMissingHashes(SQLiteDatabase database, int limit) {
        JSArray hashes = new JSArray();
        try (Cursor cursor = database.rawQuery(
            "SELECT cb.hash FROM content_blobs cb " +
                "LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash " +
                "WHERE cb.kind = 'text_body' AND cbd.hash IS NULL " +
                "AND (EXISTS (SELECT 1 FROM nodes n WHERE n.body_blob_hash = cb.hash) " +
                "OR EXISTS (SELECT 1 FROM external_documents ed WHERE ed.body_blob_hash = cb.hash)) " +
                "ORDER BY cb.created_at ASC LIMIT ?",
            new String[] { String.valueOf(Math.max(1, limit)) }
        )) {
            while (cursor.moveToNext()) {
                hashes.put(cursor.getString(0));
            }
        }
        JSObject result = new JSObject();
        result.put("hashes", hashes);
        return result;
    }

    static JSObject syncBlob(SQLiteDatabase database, String hash, String url, JSONObject headers) throws Exception {
        String normalizedHash = requireHash(hash);
        if (hasCachedBlobData(database, normalizedHash)) {
            return markCached(database, normalizedHash);
        }
        ContentBlobManifest manifest = loadManifest(database, normalizedHash);
        markAvailability(database, normalizedHash, "fetching", false);
        try {
            if (!"none".equals(manifest.compression)) {
                throw new IllegalStateException("Unsupported content blob compression.");
            }
            byte[] bytes = FolioleCompanionDesktopHttpClient.requestBytes(requireText(url, "url"), headers);
            String actualHash = sha256(bytes);
            if (!normalizedHash.equals(actualHash) || !manifest.matches(bytes.length, actualHash)) {
                throw new IllegalStateException("Content blob hash mismatch.");
            }
            return storeCachedBlob(database, normalizedHash, bytes);
        } catch (Exception error) {
            markAvailability(database, normalizedHash, "failed", false);
            throw error;
        }
    }

    private static JSObject storeCachedBlob(SQLiteDatabase database, String hash, byte[] bytes) {
        String now = Instant.now().toString();
        database.beginTransaction();
        try {
            ContentValues data = new ContentValues();
            data.put("hash", hash);
            data.put("data", bytes);
            database.insertWithOnConflict("content_blob_data", null, data, SQLiteDatabase.CONFLICT_REPLACE);

            ContentValues updates = new ContentValues();
            updates.put("availability", "cached");
            updates.put("cached_at", now);
            updates.put("last_verified_at", now);
            int updated = database.update("content_blobs", updates, "hash = ?", new String[] { hash });
            if (updated <= 0) {
                throw new IllegalStateException("Content blob manifest is missing.");
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        JSObject result = new JSObject();
        result.put("hash", hash);
        result.put("availability", "cached");
        return result;
    }

    private static ContentBlobManifest loadManifest(SQLiteDatabase database, String hash) {
        try (Cursor cursor = database.rawQuery(
            "SELECT compression, original_size_bytes, stored_size_bytes, original_sha256, stored_sha256 " +
                "FROM content_blobs WHERE hash = ? LIMIT 1",
            new String[] { hash }
        )) {
            if (!cursor.moveToFirst()) {
                throw new IllegalStateException("Content blob manifest is missing.");
            }
            return new ContentBlobManifest(
                cursor.getString(0),
                cursor.getLong(1),
                cursor.getLong(2),
                cursor.getString(3),
                cursor.getString(4)
            );
        }
    }

    private static boolean hasCachedBlobData(SQLiteDatabase database, String hash) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM content_blob_data WHERE hash = ? LIMIT 1",
            new String[] { hash }
        )) {
            return cursor.moveToFirst();
        }
    }

    private static JSObject markCached(SQLiteDatabase database, String hash) {
        markAvailability(database, hash, "cached", true);
        JSObject result = new JSObject();
        result.put("hash", hash);
        result.put("availability", "cached");
        return result;
    }

    private static void markAvailability(SQLiteDatabase database, String hash, String availability, boolean verified) {
        String now = Instant.now().toString();
        ContentValues manifest = new ContentValues();
        manifest.put("availability", availability);
        if (verified) {
            manifest.put("cached_at", now);
            manifest.put("last_verified_at", now);
        }
        int updated = database.update("content_blobs", manifest, "hash = ?", new String[] { hash });
        if (updated <= 0) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
    }

    private static String requireHash(String value) {
        String hash = requireText(value, "hash").toLowerCase();
        if (!hash.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("hash is invalid.");
        }
        return hash;
    }

    private static String requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return value.trim();
    }

    private static String sha256(byte[] bytes) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(bytes);
        StringBuilder builder = new StringBuilder();
        for (byte value : hash) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }

    private static final class ContentBlobManifest {
        final String compression;
        final long originalSizeBytes;
        final long storedSizeBytes;
        final String originalSha256;
        final String storedSha256;

        ContentBlobManifest(String compression, long originalSizeBytes, long storedSizeBytes, String originalSha256, String storedSha256) {
            this.compression = compression;
            this.originalSizeBytes = originalSizeBytes;
            this.storedSizeBytes = storedSizeBytes;
            this.originalSha256 = originalSha256;
            this.storedSha256 = storedSha256;
        }

        boolean matches(long byteLength, String hash) {
            return originalSizeBytes == byteLength &&
                storedSizeBytes == byteLength &&
                hash.equals(originalSha256) &&
                hash.equals(storedSha256);
        }
    }
}
