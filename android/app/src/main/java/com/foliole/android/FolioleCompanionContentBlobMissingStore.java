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
            hashes.put(hashString(context, blobs.getJSONObject(index)));
        }
        JSObject result = new JSObject();
        result.put(FolioleCompanionMissingResourceQueryRules.contentHashesResultKey(context), hashes);
        result.put(FolioleCompanionMissingResourceQueryRules.contentResultKey(context), blobs);
        putSummary(context, result, summarizeMissingBodies(context, database));
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
            long sizeBytes = rowLong(context, blob, "sizeBytes");
            bytes += sizeBytes;
            if (FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "failed").equals(rowString(context, blob, "availability"))) {
                failedCount++;
                failedBytes += sizeBytes;
            }
        }
        JSObject summary = new JSObject();
        summary.put(summaryKey(context, "count"), count);
        summary.put(summaryKey(context, "bytes"), bytes);
        summary.put(summaryKey(context, "failedCount"), failedCount);
        summary.put(summaryKey(context, "failedBytes"), failedBytes);
        return summary;
    }

    private static void putSummary(Context context, JSObject target, JSObject summary) throws Exception {
        target.put(summaryKey(context, "count"), summary.optLong(summaryKey(context, "count"), 0));
        target.put(summaryKey(context, "bytes"), summary.optLong(summaryKey(context, "bytes"), 0));
        target.put(summaryKey(context, "failedCount"), summary.optLong(summaryKey(context, "failedCount"), 0));
        target.put(summaryKey(context, "failedBytes"), summary.optLong(summaryKey(context, "failedBytes"), 0));
    }

    private static String hashString(Context context, JSONObject row) throws Exception {
        return FolioleCompanionMissingResourceQueryRules.contentHashString(context, row);
    }

    private static long rowLong(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionMissingResourceQueryRules.contentRowLong(context, row, key);
    }

    private static String rowString(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionMissingResourceQueryRules.contentRowString(context, row, key);
    }

    private static String summaryKey(Context context, String key) throws Exception {
        return FolioleCompanionMissingResourceQueryRules.contentSummaryKey(context, key);
    }
}
