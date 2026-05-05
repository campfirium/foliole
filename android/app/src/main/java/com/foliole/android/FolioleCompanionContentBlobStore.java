package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

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
        String normalizedHash = requireHash(context, hash);
        if (hasCachedBlobData(context, database, normalizedHash)) {
            return markCached(context, database, normalizedHash);
        }
        ContentBlobManifest manifest = loadManifest(context, database, normalizedHash);
        markFetching(context, database, normalizedHash);
        try {
            manifest.requireSupported(context);
            byte[] bytes = FolioleCompanionDesktopHttpClient.requestBytes(
                requireText(url, FolioleCompanionBridgeContractDefinitions.resourceUrlRequestKey(context)),
                headers
            );
            String actualHash = FolioleCompanionContentBlobCasRules.digestHex(context, bytes);
            if (!normalizedHash.equals(actualHash) || !manifest.matches(context, bytes.length, actualHash)) {
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
            FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "dataReplaceMutationName"), new Object[] { hash, bytes });
            int updated = markCachedRow(context, database, hash, now);
            if (updated <= 0) {
                throw new IllegalStateException("Content blob manifest is missing.");
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        JSObject result = new JSObject();
        result.put(syncResponseKey(context, "hash"), hash);
        result.put(syncResponseKey(context, "availability"), FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "cached"));
        return result;
    }

    private static ContentBlobManifest loadManifest(Context context, SQLiteDatabase database, String hash) throws Exception {
        JSONObject blob = FolioleCompanionGeneratedQueryRunner.loadFirstRow(
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
            rowString(context, blob, "compressionKey"),
            rowLong(context, blob, "originalSizeBytesKey"),
            rowLong(context, blob, "storedSizeBytesKey"),
            rowString(context, blob, "originalSha256Key"),
            rowString(context, blob, "storedSha256Key")
        );
    }

    private static boolean hasCachedBlobData(Context context, SQLiteDatabase database, String hash) throws Exception {
        return FolioleCompanionGeneratedQueryRunner.hasRows(
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

    private static long rowLong(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.contentBlobRowLong(context, row, key);
    }

    private static String rowString(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.contentBlobRowString(context, row, key);
    }

    private static JSObject markCached(Context context, SQLiteDatabase database, String hash) throws Exception {
        int updated = markCachedRow(context, database, hash, Instant.now().toString());
        if (updated <= 0) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
        JSObject result = new JSObject();
        result.put(syncResponseKey(context, "hash"), hash);
        result.put(syncResponseKey(context, "availability"), FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "cached"));
        return result;
    }

    private static int markCachedRow(Context context, SQLiteDatabase database, String hash, String now) throws Exception {
        return FolioleCompanionGeneratedMutationRunner.executeChanged(
            context,
            database,
            mutationRule(context, "markCachedMutationName"),
            new Object[] { now, now, hash }
        );
    }

    private static void markFetching(Context context, SQLiteDatabase database, String hash) throws Exception {
        int updated = FolioleCompanionGeneratedMutationRunner.executeChanged(
            context,
            database,
            mutationRule(context, "markFetchingMutationName"),
            new Object[] { hash }
        );
        if (updated <= 0) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
    }

    private static void markFailed(Context context, SQLiteDatabase database, String hash) throws Exception {
        FolioleCompanionGeneratedMutationRunner.executeChanged(
            context,
            database,
            mutationRule(context, "markFailedMutationName"),
            new Object[] { hash }
        );
    }

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceMutationRules.contentBlobString(context, key);
    }

    private static String syncResponseKey(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.contentBlobSyncResponseKey(context, key);
    }

    private static String requireHash(Context context, String value) throws Exception {
        String field = FolioleCompanionBridgeContractDefinitions.resourceHashRequestKey(context);
        return FolioleCompanionContentBlobCasRules.requireHash(context, value, field);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return value.trim();
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

        void requireSupported(Context context) throws Exception {
            FolioleCompanionContentBlobCasRules.requireSupportedCompression(context, compression);
        }

        boolean matches(Context context, long byteLength, String hash) throws Exception {
            return FolioleCompanionContentBlobCasRules.manifestMatches(
                context,
                byteLength,
                hash,
                originalSizeBytes,
                storedSizeBytes,
                originalSha256,
                storedSha256
            );
        }
    }
}
