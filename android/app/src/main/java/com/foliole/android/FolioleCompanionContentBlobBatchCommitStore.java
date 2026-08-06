package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

final class FolioleCompanionContentBlobBatchCommitStore {
    private FolioleCompanionContentBlobBatchCommitStore() {}

    static JSObject commitDownloadedBlobs(Context context, SQLiteDatabase database, String batchToken) throws Exception {
        long startedAt = System.nanoTime();
        FolioleCompanionContentBlobBatchSessions.Session session = FolioleCompanionContentBlobBatchSessions.get(batchToken);
        if (session == null) {
            throw new IllegalStateException("Content blob batch token is unknown or expired.");
        }
        if (session.committed()) {
            return commitResponse(context, strings(session.committedHashes()), 0L);
        }
        WriteResult result = storeDownloadedBlobs(
            context, database, FolioleCompanionContentBlobPack.read(session.pack), session.failedHashes
        );
        FolioleCompanionContentBlobBatchSessions.markCommitted(batchToken, jsArrayStrings(result.syncedHashes));
        return commitResponse(context, result.syncedHashes, elapsedMs(startedAt));
    }

    static WriteResult storeDownloadedBlobs(
        Context context,
        SQLiteDatabase database,
        List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs,
        List<String> failedHashes
    ) throws Exception {
        long startedAt = System.nanoTime();
        JSArray syncedHashes = new JSArray();
        List<CachedBlob> cachedBlobs = new ArrayList<>();
        List<String> failures = new ArrayList<>(failedHashes);
        Map<String, FolioleCompanionContentBlobBatchManifestStore.Manifest> manifests =
            FolioleCompanionContentBlobBatchManifestStore.load(context, database, blobs);
        for (FolioleCompanionContentBlobMultipartBatch.Blob blob : blobs) {
            addBatchBlobOrFailure(context, blob, manifests, cachedBlobs, syncedHashes, failures);
        }
        storeCachedBlobsAndFailures(context, database, cachedBlobs, failures);
        return new WriteResult(syncedHashes, elapsedMs(startedAt));
    }

    private static void addBatchBlobOrFailure(
        Context context,
        FolioleCompanionContentBlobMultipartBatch.Blob blob,
        Map<String, FolioleCompanionContentBlobBatchManifestStore.Manifest> manifests,
        List<CachedBlob> cachedBlobs,
        JSArray syncedHashes,
        List<String> failures
    ) throws Exception {
        try {
            String hash = FolioleCompanionContentBlobBatchManifestStore.requireHash(context, blob.hash);
            addBatchBlob(context, hash, blob.bytes, manifests.get(hash), cachedBlobs, syncedHashes);
        } catch (Exception error) {
            failures.add(blob.hash);
        }
    }

    private static void addBatchBlob(
        Context context,
        String hash,
        byte[] bytes,
        FolioleCompanionContentBlobBatchManifestStore.Manifest manifest,
        List<CachedBlob> cachedBlobs,
        JSArray syncedHashes
    ) throws Exception {
        if (manifest == null) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
        manifest.requireSupported(context);
        String actualHash = FolioleCompanionContentBlobCasRules.digestHex(context, bytes);
        if (!hash.equals(actualHash) || !manifest.matches(context, bytes.length, actualHash)) {
            throw new IllegalStateException("Content blob hash mismatch.");
        }
        cachedBlobs.add(new CachedBlob(hash, bytes));
        syncedHashes.put(hash);
    }

    private static void storeCachedBlobsAndFailures(
        Context context,
        SQLiteDatabase database,
        List<CachedBlob> blobs,
        List<String> failedHashes
    ) throws Exception {
        String now = Instant.now().toString();
        database.beginTransaction();
        try {
            for (CachedBlob blob : blobs) storeCachedBlob(context, database, blob, now);
            for (String hash : failedHashes) markFailedHash(context, database, hash);
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
        if (updated <= 0) throw new IllegalStateException("Content blob manifest is missing.");
    }

    private static void markFailedHash(Context context, SQLiteDatabase database, String hash) throws Exception {
        FolioleCompanionGeneratedMutationRunner.executeChanged(
            context,
            database,
            mutationRule(context, "markFailedMutationName"),
            new Object[] { hash }
        );
    }

    private static JSObject commitResponse(Context context, JSArray syncedHashes, long dbElapsedMs) throws Exception {
        JSObject result = new JSObject();
        result.put(batchResponseKey(context, "syncedHashes"), syncedHashes);
        result.put(batchResponseKey(context, "databaseElapsedMs"), dbElapsedMs);
        return result;
    }

    private static JSArray strings(List<String> values) {
        JSArray result = new JSArray();
        for (String value : values) result.put(value);
        return result;
    }

    private static List<String> jsArrayStrings(JSArray values) throws Exception {
        List<String> result = new ArrayList<>();
        for (int index = 0; index < values.length(); index += 1) result.add(values.getString(index));
        return result;
    }

    private static long elapsedMs(long startedAt) {
        return Math.max(0L, (System.nanoTime() - startedAt) / 1_000_000L);
    }

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceMutationRules.contentBlobString(context, key);
    }

    private static String batchResponseKey(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.contentBlobBatchResponseKey(context, key);
    }

    static final class WriteResult {
        final long dbElapsedMs;
        final JSArray syncedHashes;

        WriteResult(JSArray syncedHashes, long dbElapsedMs) {
            this.syncedHashes = syncedHashes;
            this.dbElapsedMs = dbElapsedMs;
        }
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
