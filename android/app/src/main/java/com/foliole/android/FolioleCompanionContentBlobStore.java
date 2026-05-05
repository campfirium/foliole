package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.security.MessageDigest;
import java.time.Instant;

final class FolioleCompanionContentBlobStore {
    private FolioleCompanionContentBlobStore() {}

    static JSObject loadMissingHashes(Context context, SQLiteDatabase database, int limit) throws Exception {
        return FolioleCompanionContentBlobMissingStore.loadMissingHashes(context, database, limit);
    }

    static JSObject summarizeMissingBodies(Context context, SQLiteDatabase database) throws Exception {
        return FolioleCompanionContentBlobMissingStore.summarizeMissingBodies(context, database);
    }

    static JSObject syncBlob(Context context, SQLiteDatabase database, String hash, String url, JSONObject headers) throws Exception {
        String normalizedHash = requireHash(hash);
        if (hasCachedBlobData(context, database, normalizedHash)) {
            return markCached(context, database, normalizedHash);
        }
        ContentBlobManifest manifest = loadManifest(context, database, normalizedHash);
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
        result.put("availability", FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "cached"));
        return result;
    }

    private static ContentBlobManifest loadManifest(Context context, SQLiteDatabase database, String hash) throws Exception {
        JSONObject blob = FolioleCompanionNamedQueryStore.loadFirstRow(
            context,
            database,
            resourceRule(context, "manifestQueryName"),
            resourceRule(context, "resultKey"),
            new String[] { hash }
        );
        if (blob == null) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
        return new ContentBlobManifest(
            blob.getString(resourceRule(context, "compressionKey")),
            blob.getLong(resourceRule(context, "originalSizeBytesKey")),
            blob.getLong(resourceRule(context, "storedSizeBytesKey")),
            blob.getString(resourceRule(context, "originalSha256Key")),
            blob.getString(resourceRule(context, "storedSha256Key"))
        );
    }

    private static boolean hasCachedBlobData(Context context, SQLiteDatabase database, String hash) throws Exception {
        return FolioleCompanionNamedQueryStore.hasRows(
            context,
            database,
            resourceRule(context, "existingQueryName"),
            resourceRule(context, "resultKey"),
            new String[] { hash }
        );
    }

    private static String resourceRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.contentBlobString(context, key);
    }

    private static JSObject markCached(Context context, SQLiteDatabase database, String hash) throws Exception {
        int updated = markCachedRow(context, database, hash, Instant.now().toString());
        if (updated <= 0) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
        JSObject result = new JSObject();
        result.put("hash", hash);
        result.put("availability", FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "cached"));
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
