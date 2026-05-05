package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionContentBlobMissingStore {
    private FolioleCompanionContentBlobMissingStore() {}

    static JSObject loadMissingHashes(Context context, SQLiteDatabase database, int limit) throws Exception {
        JSArray hashes = new JSArray();
        JSArray blobs = FolioleCompanionNamedQueryStore
            .loadRows(context, database, "contentBlobMissingHashes", "blobs", new String[] { String.valueOf(Math.max(1, limit)) });
        for (int index = 0; index < blobs.length(); index += 1) {
            hashes.put(blobs.getJSONObject(index).getString("hash"));
        }
        JSObject result = new JSObject();
        result.put("hashes", hashes);
        result.put("blobs", blobs);
        return result;
    }

    static JSObject summarizeMissingBodies(Context context, SQLiteDatabase database) throws Exception {
        long count = 0;
        long bytes = 0;
        long failedCount = 0;
        long failedBytes = 0;
        JSArray blobs = FolioleCompanionNamedQueryStore.loadRows(context, database, "contentBlobMissingSummaryRows", "blobs");
        for (int index = 0; index < blobs.length(); index += 1) {
            JSONObject blob = blobs.getJSONObject(index);
            count++;
            long sizeBytes = blob.getLong("size_bytes");
            bytes += sizeBytes;
            if ("failed".equals(blob.getString("availability"))) {
                failedCount++;
                failedBytes += sizeBytes;
            }
        }
        JSObject summary = new JSObject();
        summary.put("missing_content_blob_count", count);
        summary.put("missing_content_blob_bytes", bytes);
        summary.put("failed_content_blob_count", failedCount);
        summary.put("failed_content_blob_bytes", failedBytes);
        return summary;
    }
}
