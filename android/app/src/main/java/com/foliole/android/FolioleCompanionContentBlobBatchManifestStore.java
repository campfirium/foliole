package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class FolioleCompanionContentBlobBatchManifestStore {
    private FolioleCompanionContentBlobBatchManifestStore() {}

    static Map<String, Manifest> load(
        SQLiteDatabase database,
        List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs
    ) {
        Map<String, Manifest> manifests = new HashMap<>();
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
                manifests.put(cursor.getString(0), new Manifest(
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

    static String requireHash(String value) {
        String hash = FolioleCompanionContentBlobBatchText.requireText(value, "hash").toLowerCase();
        if (!hash.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("hash is invalid.");
        }
        return hash;
    }

    static final class Manifest {
        private final String compression;
        private final long originalSizeBytes;
        private final long storedSizeBytes;
        private final String originalSha256;
        private final String storedSha256;

        Manifest(
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

        void requireSupported() {
            if (!"none".equals(compression)) {
                throw new IllegalStateException("Unsupported content blob compression.");
            }
        }

        boolean matches(long byteLength, String hash) {
            return originalSizeBytes == byteLength &&
                storedSizeBytes == byteLength &&
                hash.equals(originalSha256) &&
                hash.equals(storedSha256);
        }
    }
}
