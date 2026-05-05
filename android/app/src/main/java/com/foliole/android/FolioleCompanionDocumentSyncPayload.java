package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

final class FolioleCompanionDocumentSyncPayload {

    private FolioleCompanionDocumentSyncPayload() {}

    static void apply(Context context, SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        if (!record.isNull("deleted_at")) {
            FolioleCompanionNamedMutationStore.execute(context, database, mutationRule(context, "markMissingMutationName"), new Object[] {
                record.optString("deleted_at"),
                record.optString("updated_at"),
                objectId
            });
            return;
        }
        JSONObject payload = payload(record);
        FolioleCompanionNamedMutationStore.execute(context, database, mutationRule(context, "upsertMutationName"), new Object[] {
            objectId,
            payload.optString("folder_id", ""),
            payload.optString("relative_path", ""),
            payload.optString("file_name", ""),
            payload.optString("extension", ""),
            payload.optLong("source_size_bytes", 0),
            payload.optString("source_modified_at", record.optString("updated_at")),
            payload.optLong("source_modified_ms", 0),
            payload.optString("content_hash", record.optString("content_hash")),
            nullIfEmpty(payload.optString("title", "")),
            nullIfEmpty(payload.optString("opening_text", "")),
            nullIfEmpty(payload.optString("body_blob_hash", "")),
            payload.optString("content", ""),
            payload.optString("indexed_at", record.optString("updated_at")),
            payload.optInt("is_present", 1),
            nullIfEmpty(payload.optString("missing_at", "")),
            payload.optString("created_at", record.optString("updated_at")),
            record.optString("updated_at")
        });
    }

    private static JSONObject payload(JSONObject record) throws Exception {
        return FolioleCompanionSyncPayloadJson.payload(record);
    }

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionSyncApplyMutationRules.string(context, "documents", key);
    }

    private static String nullIfEmpty(String value) {
        return value == null || value.trim().isEmpty() ? null : value;
    }
}
