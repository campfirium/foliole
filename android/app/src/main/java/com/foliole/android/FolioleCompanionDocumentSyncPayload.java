package com.foliole.android;

import android.content.ContentValues;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

final class FolioleCompanionDocumentSyncPayload {

    private FolioleCompanionDocumentSyncPayload() {}

    static void apply(SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        if (!record.isNull("deleted_at")) {
            ContentValues missing = new ContentValues();
            missing.put("is_present", 0);
            missing.put("missing_at", record.optString("deleted_at"));
            missing.put("updated_at", record.optString("updated_at"));
            database.update("external_documents", missing, "document_id = ?", new String[] { objectId });
            return;
        }
        JSONObject payload = payload(record);
        ContentValues values = new ContentValues();
        values.put("document_id", objectId);
        values.put("folder_id", payload.optString("folder_id", ""));
        values.put("relative_path", payload.optString("relative_path", ""));
        values.put("file_name", payload.optString("file_name", ""));
        values.put("extension", payload.optString("extension", ""));
        values.put("source_size_bytes", payload.optLong("source_size_bytes", 0));
        values.put("source_modified_at", payload.optString("source_modified_at", record.optString("updated_at")));
        values.put("source_modified_ms", payload.optLong("source_modified_ms", 0));
        values.put("content_hash", payload.optString("content_hash", record.optString("content_hash")));
        values.put("title", nullIfEmpty(payload.optString("title", "")));
        values.put("opening_text", nullIfEmpty(payload.optString("opening_text", "")));
        values.put("body_blob_hash", nullIfEmpty(payload.optString("body_blob_hash", "")));
        values.put("content", payload.optString("content", ""));
        values.put("indexed_at", payload.optString("indexed_at", record.optString("updated_at")));
        values.put("is_present", payload.optInt("is_present", 1));
        values.put("missing_at", nullIfEmpty(payload.optString("missing_at", "")));
        values.put("created_at", payload.optString("created_at", record.optString("updated_at")));
        values.put("updated_at", record.optString("updated_at"));
        database.insertWithOnConflict("external_documents", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static JSONObject payload(JSONObject record) throws Exception {
        return FolioleCompanionSyncPayloadJson.payload(record);
    }

    private static String nullIfEmpty(String value) {
        return value == null || value.trim().isEmpty() ? null : value;
    }
}
