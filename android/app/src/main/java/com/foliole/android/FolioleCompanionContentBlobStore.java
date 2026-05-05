package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.security.MessageDigest;
import java.time.Instant;

final class FolioleCompanionContentBlobStore {
    private FolioleCompanionContentBlobStore() {}

    static JSObject loadMissingHashes(SQLiteDatabase database, int limit) {
        return FolioleCompanionContentBlobMissingStore.loadMissingHashes(database, limit);
    }

    static JSObject summarizeMissingBodies(SQLiteDatabase database) {
        return FolioleCompanionContentBlobMissingStore.summarizeMissingBodies(database);
    }

    static JSObject syncBlob(Context context, SQLiteDatabase database, String hash, String url, JSONObject headers) throws Exception {
        String normalizedHash = requireHash(hash);
        if (hasCachedBlobData(database, normalizedHash)) {
            return markCached(context, database, normalizedHash);
        }
        ContentBlobManifest manifest = loadManifest(database, normalizedHash);
        markFetching(context, database, normalizedHash);
        try {
            if (!"none".equals(manifest.compression)) {
                throw new IllegalStateException("Unsupported content blob compression.");
            }
            byte[] bytes = FolioleCompanionDesktopHttpClient.requestBytes(requireText(url, "url"), headers);
            String actualHash = sha256(bytes);
            if (!normalizedHash.equals(actualHash) || !manifest.matches(bytes.length, actualHash)) {
                throw new IllegalStateException("Content blob hash mismatch.");
            }
            return storeCachedBlob(context, database, normalizedHash, bytes);
        } catch (Exception error) {
            markFailed(context, database, normalizedHash);
            throw error;
        }
    }

    private static JSObject storeCachedBlob(Context context, SQLiteDatabase database, String hash, byte[] bytes) throws Exception {
        String now = Instant.now().toString();
        database.beginTransaction();
        try {
            FolioleCompanionNamedMutationStore.execute(context, database, "contentBlobDataReplace", new Object[] { hash, bytes });
            int updated = markCachedRow(context, database, hash, now);
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

    private static JSObject markCached(Context context, SQLiteDatabase database, String hash) throws Exception {
        int updated = markCachedRow(context, database, hash, Instant.now().toString());
        if (updated <= 0) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
        JSObject result = new JSObject();
        result.put("hash", hash);
        result.put("availability", "cached");
        return result;
    }

    private static int markCachedRow(Context context, SQLiteDatabase database, String hash, String now) throws Exception {
        return FolioleCompanionNamedMutationStore.executeChanged(
            context,
            database,
            "contentBlobMarkCached",
            new Object[] { now, now, hash }
        );
    }

    private static void markFetching(Context context, SQLiteDatabase database, String hash) throws Exception {
        int updated = FolioleCompanionNamedMutationStore.executeChanged(
            context,
            database,
            "contentBlobMarkFetching",
            new Object[] { hash }
        );
        if (updated <= 0) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
    }

    private static void markFailed(Context context, SQLiteDatabase database, String hash) throws Exception {
        FolioleCompanionNamedMutationStore.executeChanged(
            context,
            database,
            "contentBlobMarkFailed",
            new Object[] { hash }
        );
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
