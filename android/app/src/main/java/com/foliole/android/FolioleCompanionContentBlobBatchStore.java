package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteStatement;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class FolioleCompanionContentBlobBatchStore {
    private FolioleCompanionContentBlobBatchStore() {}

    static JSObject syncBlobs(SQLiteDatabase database, String url, JSONObject headers, String body) throws Exception {
        long startedAt = System.nanoTime();
        long httpStartedAt = System.nanoTime();
        FolioleCompanionDesktopHttpClient.BinaryResponse response = FolioleCompanionDesktopHttpClient.requestBinary(
            requireText(url, "url"),
            "POST",
            headers,
            body
        );
        long httpElapsedMs = elapsedMs(httpStartedAt);
        long parseStartedAt = System.nanoTime();
        List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs =
            FolioleCompanionContentBlobMultipartBatch.parse(response.body, response.contentType);
        long parseElapsedMs = elapsedMs(parseStartedAt);
        JSArray syncedHashes = new JSArray();
        List<CachedBlob> cachedBlobs = new ArrayList<>();
        long databaseStartedAt = System.nanoTime();
        Map<String, ContentBlobManifest> manifests = loadManifests(database, blobs);
        for (FolioleCompanionContentBlobMultipartBatch.Blob blob : blobs) {
            addBatchBlob(blob, manifests, cachedBlobs, syncedHashes);
        }
        storeCachedBlobs(database, cachedBlobs);
        long databaseElapsedMs = elapsedMs(databaseStartedAt);
        JSObject result = new JSObject();
        result.put("synced_hashes", syncedHashes);
        result.put("http_elapsed_ms", httpElapsedMs);
        result.put("parse_elapsed_ms", parseElapsedMs);
        result.put("db_elapsed_ms", databaseElapsedMs);
        result.put("total_elapsed_ms", elapsedMs(startedAt));
        return result;
    }

    private static void addBatchBlob(
        FolioleCompanionContentBlobMultipartBatch.Blob blob,
        Map<String, ContentBlobManifest> manifests,
        List<CachedBlob> cachedBlobs,
        JSArray syncedHashes
    ) throws Exception {
        String hash = requireHash(blob.hash);
        ContentBlobManifest manifest = manifests.get(hash);
        if (manifest == null) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
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
            SQLiteStatement insertData = database.compileStatement(
                "INSERT OR REPLACE INTO content_blob_data (hash, data) VALUES (?, ?)"
            );
            SQLiteStatement updateManifest = database.compileStatement(
                "UPDATE content_blobs SET availability = 'cached', cached_at = ?, last_verified_at = ? WHERE hash = ?"
            );
            for (CachedBlob blob : blobs) {
                storeCachedBlob(insertData, updateManifest, blob, now);
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    private static void storeCachedBlob(
        SQLiteStatement insertData,
        SQLiteStatement updateManifest,
        CachedBlob blob,
        String now
    ) {
        insertData.clearBindings();
        insertData.bindString(1, blob.hash);
        insertData.bindBlob(2, blob.bytes);
        insertData.executeInsert();

        updateManifest.clearBindings();
        updateManifest.bindString(1, now);
        updateManifest.bindString(2, now);
        updateManifest.bindString(3, blob.hash);
        int updated = updateManifest.executeUpdateDelete();
        if (updated <= 0) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
    }

    private static Map<String, ContentBlobManifest> loadManifests(
        SQLiteDatabase database,
        List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs
    ) {
        Map<String, ContentBlobManifest> manifests = new HashMap<>();
        if (blobs.isEmpty()) {
            return manifests;
        }
        String[] hashes = new String[blobs.size()];
        StringBuilder placeholders = new StringBuilder();
        for (int index = 0; index < blobs.size(); index += 1) {
            hashes[index] = requireHash(blobs.get(index).hash);
            if (index > 0) placeholders.append(", ");
            placeholders.append("?");
        }
        try (Cursor cursor = database.rawQuery(
            "SELECT hash, compression, original_size_bytes, stored_size_bytes, original_sha256, stored_sha256 " +
                "FROM content_blobs WHERE hash IN (" + placeholders + ")",
            hashes
        )) {
            while (cursor.moveToNext()) {
                manifests.put(cursor.getString(0), new ContentBlobManifest(
                    cursor.getString(1),
                    cursor.getLong(2),
                    cursor.getLong(3),
                    cursor.getString(4),
                    cursor.getString(5)
                ));
            }
        }
        return manifests;
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

    private static long elapsedMs(long startedAt) {
        return Math.max(0L, (System.nanoTime() - startedAt) / 1_000_000L);
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
