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
        JSArray blobs = FolioleCompanionGeneratedQueryRunner
            .loadRows(
                context,
                database,
                FolioleCompanionMissingResourceQueryRules.contentHashesQueryName(context),
                FolioleCompanionMissingResourceQueryRules.contentResultKey(context),
                new String[] { String.valueOf(FolioleCompanionMissingResourceQueryRules.contentLimit(context, limit)) }
            );
        for (int index = 0; index < blobs.length(); index += 1) {
            hashes.put(blobs.getJSONObject(index).getString(FolioleCompanionMissingResourceQueryRules.contentHashKey(context)));
        }
        JSObject result = new JSObject();
        result.put(FolioleCompanionMissingResourceQueryRules.contentHashesResultKey(context), hashes);
        result.put(FolioleCompanionMissingResourceQueryRules.contentResultKey(context), blobs);
        return result;
    }

    static JSObject summarizeMissingBodies(Context context, SQLiteDatabase database) throws Exception {
        long count = 0;
        long bytes = 0;
        long failedCount = 0;
        long failedBytes = 0;
        JSArray blobs = FolioleCompanionGeneratedQueryRunner.loadRows(
            context,
            database,
            FolioleCompanionMissingResourceQueryRules.contentSummaryQueryName(context),
            FolioleCompanionMissingResourceQueryRules.contentResultKey(context)
        );
        for (int index = 0; index < blobs.length(); index += 1) {
            JSONObject blob = blobs.getJSONObject(index);
            count++;
            long sizeBytes = blob.getLong("size_bytes");
            bytes += sizeBytes;
            if (FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "failed").equals(blob.getString("availability"))) {
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
