package com.foliole.android;

import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteStatement;

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

    static JSObject syncBlobs(SQLiteDatabase database, String url, JSONObject headers, String body) throws Exception {
        long startedAt = System.nanoTime();
        long httpStartedAt = System.nanoTime();
        FolioleCompanionDesktopHttpClient.BinaryResponse response = FolioleCompanionDesktopHttpClient.requestBinary(
            FolioleCompanionContentBlobBatchText.requireText(url, "url"),
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
        Map<String, FolioleCompanionContentBlobBatchManifestStore.Manifest> manifests =
            FolioleCompanionContentBlobBatchManifestStore.load(database, blobs);
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
        Map<String, FolioleCompanionContentBlobBatchManifestStore.Manifest> manifests,
        List<CachedBlob> cachedBlobs,
        JSArray syncedHashes
    ) throws Exception {
        String hash = FolioleCompanionContentBlobBatchManifestStore.requireHash(blob.hash);
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
}
