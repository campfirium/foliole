package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

final class FolioleCompanionContentBlobBatchStore {
    private FolioleCompanionContentBlobBatchStore() {}

    static JSObject syncBlobs(Context context, SQLiteDatabase database, String url, JSONObject headers, String body) throws Exception {
        long startedAt = System.nanoTime();
        long httpStartedAt = System.nanoTime();
        FolioleCompanionDesktopHttpClient.BinaryResponse response = FolioleCompanionDesktopHttpClient.requestBinary(
            FolioleCompanionContentBlobBatchText.requireText(
                url,
                FolioleCompanionBridgeContractDefinitions.resourceUrlRequestKey(context)
            ),
            "POST",
            headers,
            body
        );
        long httpElapsedMs = elapsedMs(httpStartedAt);
        long parseStartedAt = System.nanoTime();
        List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs =
            FolioleCompanionContentBlobMultipartBatch.parse(
                response.body,
                response.contentType,
                FolioleCompanionBridgeContractDefinitions.resourceHashRequestKey(context)
            );
        long parseElapsedMs = elapsedMs(parseStartedAt);
        JSArray syncedHashes = new JSArray();
        List<CachedBlob> cachedBlobs = new ArrayList<>();
        long databaseStartedAt = System.nanoTime();
        Map<String, FolioleCompanionContentBlobBatchManifestStore.Manifest> manifests =
            FolioleCompanionContentBlobBatchManifestStore.load(context, database, blobs);
        for (FolioleCompanionContentBlobMultipartBatch.Blob blob : blobs) {
            addBatchBlob(context, blob, manifests, cachedBlobs, syncedHashes);
        }
        storeCachedBlobs(context, database, cachedBlobs);
        long databaseElapsedMs = elapsedMs(databaseStartedAt);
        JSObject result = new JSObject();
        JSONObject responseKeys = resourceObject(context, "batchResponseKeys");
        result.put(responseKeys.getString("syncedHashes"), syncedHashes);
        result.put(responseKeys.getString("httpElapsedMs"), httpElapsedMs);
        result.put(responseKeys.getString("parseElapsedMs"), parseElapsedMs);
        result.put(responseKeys.getString("databaseElapsedMs"), databaseElapsedMs);
        result.put(responseKeys.getString("totalElapsedMs"), elapsedMs(startedAt));
        return result;
    }

    private static void addBatchBlob(
        Context context,
        FolioleCompanionContentBlobMultipartBatch.Blob blob,
        Map<String, FolioleCompanionContentBlobBatchManifestStore.Manifest> manifests,
        List<CachedBlob> cachedBlobs,
        JSArray syncedHashes
    ) throws Exception {
        String hash = FolioleCompanionContentBlobBatchManifestStore.requireHash(context, blob.hash);
        FolioleCompanionContentBlobBatchManifestStore.Manifest manifest = manifests.get(hash);
        if (manifest == null) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
        manifest.requireSupported();
        byte[] bytes = blob.bytes;
        String actualHash = sha256(bytes);
        if (!hash.equals(actualHash) || !manifest.matches(bytes.length, actualHash)) {
            throw new IllegalStateException("Content blob hash mismatch.");
        }
        cachedBlobs.add(new CachedBlob(hash, bytes));
        syncedHashes.put(hash);
    }

    private static void storeCachedBlobs(Context context, SQLiteDatabase database, List<CachedBlob> blobs) throws Exception {
        if (blobs.isEmpty()) {
            return;
        }
        String now = Instant.now().toString();
        database.beginTransaction();
        try {
            for (CachedBlob blob : blobs) {
                storeCachedBlob(context, database, blob, now);
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    private static void storeCachedBlob(
        Context context,
        SQLiteDatabase database,
        CachedBlob blob,
        String now
    ) throws Exception {
        FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "dataReplaceMutationName"), new Object[] {
            blob.hash,
            blob.bytes
        });
        int updated = FolioleCompanionGeneratedMutationRunner.executeChanged(
            context,
            database,
            mutationRule(context, "markCachedMutationName"),
            new Object[] { now, now, blob.hash }
        );
        if (updated <= 0) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
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

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceMutationRules.contentBlobString(context, key);
    }

    private static JSONObject resourceObject(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.contentBlobObject(context, key);
    }

    private static final class CachedBlob {
        final String hash;
        final byte[] bytes;

        CachedBlob(String hash, byte[] bytes) {
            this.hash = hash;
            this.bytes = bytes;
        }
    }
}
