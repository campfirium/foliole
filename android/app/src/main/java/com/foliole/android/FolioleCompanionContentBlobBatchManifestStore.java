package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class FolioleCompanionContentBlobBatchManifestStore {
    private FolioleCompanionContentBlobBatchManifestStore() {}

    static Map<String, Manifest> load(
        Context context,
        SQLiteDatabase database,
        List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs
    ) throws Exception {
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
        JSONArray rows = FolioleCompanionNamedQueryStore
            .loadArray(
                context,
                database,
                "contentBlobManifestsByHashes",
                Collections.singletonMap("__HASH_FILTER__", placeholders.toString()),
                hashes
            )
            .getJSONArray("blobs");
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.getJSONObject(index);
            manifests.put(row.getString("hash"), new Manifest(
                row.getString("compression"),
                row.getLong("original_size_bytes"),
                row.getLong("stored_size_bytes"),
                row.getString("original_sha256"),
                row.getString("stored_sha256")
            ));
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
