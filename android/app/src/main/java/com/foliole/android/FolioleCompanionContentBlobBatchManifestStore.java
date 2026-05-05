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
            hashes[index] = requireHash(context, blobs.get(index).hash);
            if (index > 0) placeholders.append(", ");
            placeholders.append("?");
        }
        JSONArray rows = FolioleCompanionGeneratedQueryRunner
            .load(
                context,
                database,
                resourceRule(context, "manifestsByHashesQueryName"),
                Collections.singletonMap(resourceRule(context, "hashesReplacement"), placeholders.toString()),
                hashes
            )
            .getJSONArray(resourceRule(context, "resultKey"));
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.getJSONObject(index);
            manifests.put(rowString(context, row, "hashKey"), new Manifest(
                rowString(context, row, "compressionKey"),
                rowLong(context, row, "originalSizeBytesKey"),
                rowLong(context, row, "storedSizeBytesKey"),
                rowString(context, row, "originalSha256Key"),
                rowString(context, row, "storedSha256Key")
            ));
        }
        return manifests;
    }

    static String requireHash(Context context, String value) throws Exception {
        String hash = FolioleCompanionContentBlobBatchText
            .requireText(value, FolioleCompanionBridgeContractDefinitions.resourceHashRequestKey(context))
            .toLowerCase();
        if (!hash.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException(FolioleCompanionBridgeContractDefinitions.resourceHashRequestKey(context) + " is invalid.");
        }
        return hash;
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
