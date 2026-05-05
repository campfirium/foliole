package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

final class FolioleCompanionContentBlobBatchStore {
    private FolioleCompanionContentBlobBatchStore() {}

    static JSObject syncBlobs(SQLiteDatabase database, String url, JSONObject headers, String body) throws Exception {
        FolioleCompanionDesktopHttpClient.BinaryResponse response = FolioleCompanionDesktopHttpClient.requestBinary(
            requireText(url, "url"),
            "POST",
            headers,
            body
        );
        List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs =
            FolioleCompanionContentBlobMultipartBatch.parse(response.body, response.contentType);
        JSArray syncedHashes = new JSArray();
        List<CachedBlob> cachedBlobs = new ArrayList<>();
        for (FolioleCompanionContentBlobMultipartBatch.Blob blob : blobs) {
            addBatchBlob(database, blob, cachedBlobs, syncedHashes);
        }
        storeCachedBlobs(database, cachedBlobs);
        JSObject result = new JSObject();
        result.put("synced_hashes", syncedHashes);
        return result;
    }

    private static void addBatchBlob(
        SQLiteDatabase database,
        FolioleCompanionContentBlobMultipartBatch.Blob blob,
        List<CachedBlob> cachedBlobs,
        JSArray syncedHashes
    ) throws Exception {
        String hash = requireHash(blob.hash);
        if (hasCachedBlobData(database, hash)) {
            syncedHashes.put(hash);
            return;
        }
        ContentBlobManifest manifest = loadManifest(database, hash);
        if (!"none".equals(manifest.compression)) {
            throw new IllegalStateException("Unsupported content blob compression.");
        }
        byte[] bytes = blob.bytes;
        String actualHash = sha256(bytes);
        if (!hash.equals(actualHash) || !manifest.matches(bytes.length, actualHash)) {
            throw new IllegalStateException("Content blob hash mismatch.");
        }
        cachedBlobs.add(new CachedBlob(hash, bytes));
        syncedHashes.put(hash);
    }

    private static void storeCachedBlobs(SQLiteDatabase database, List<CachedBlob> blobs) {
        if (blobs.isEmpty()) {
            return;
        }
        String now = Instant.now().toString();
        database.beginTransaction();
        try {
            for (CachedBlob blob : blobs) {
                storeCachedBlob(database, blob, now);
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    private static void storeCachedBlob(SQLiteDatabase database, CachedBlob blob, String now) {
        ContentValues data = new ContentValues();
        data.put("hash", blob.hash);
        data.put("data", blob.bytes);
        database.insertWithOnConflict("content_blob_data", null, data, SQLiteDatabase.CONFLICT_REPLACE);

        ContentValues updates = new ContentValues();
        updates.put("availability", "cached");
        updates.put("cached_at", now);
        updates.put("last_verified_at", now);
        int updated = database.update("content_blobs", updates, "hash = ?", new String[] { blob.hash });
        if (updated <= 0) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
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
        return hex(hash);
    }

    private static String hex(byte[] bytes) {
        StringBuilder builder = new StringBuilder();
        for (byte value : bytes) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }

    private static final class CachedBlob {
        final String hash;
        final byte[] bytes;

        CachedBlob(String hash, byte[] bytes) {
            this.hash = hash;
            this.bytes = bytes;
        }
    }

    private static final class ContentBlobManifest {
        final String compression;
        final long originalSizeBytes;
        final long storedSizeBytes;
        final String originalSha256;
        final String storedSha256;

        ContentBlobManifest(
            String compression,
            long originalSizeBytes,
            long storedSizeBytes,
            String originalSha256,
            String storedSha256
        ) {
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
