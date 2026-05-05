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
        values.put("folder_id", payload.optString("folder_id", payload.optString("folderId", "")));
        values.put("relative_path", payload.optString("relative_path", payload.optString("relativePath", "")));
        values.put("file_name", payload.optString("file_name", payload.optString("fileName", "")));
        values.put("extension", payload.optString("extension", ""));
        values.put("source_size_bytes", payload.optLong("source_size_bytes", payload.optLong("sourceSizeBytes", 0)));
        values.put("source_modified_at", payload.optString("source_modified_at", payload.optString("sourceModifiedAt", record.optString("updated_at"))));
        values.put("source_modified_ms", payload.optLong("source_modified_ms", payload.optLong("sourceModifiedMs", 0)));
        values.put("content_hash", payload.optString("content_hash", payload.optString("contentHash", record.optString("content_hash"))));
        values.put("title", nullIfEmpty(payload.optString("title", "")));
        values.put("opening_text", nullIfEmpty(payload.optString("opening_text", payload.optString("openingText", ""))));
        values.put("content", payload.optString("content", ""));
        values.put("indexed_at", payload.optString("indexed_at", payload.optString("indexedAt", record.optString("updated_at"))));
        values.put("is_present", payload.optInt("is_present", payload.optInt("isPresent", 1)));
        values.put("missing_at", nullIfEmpty(payload.optString("missing_at", payload.optString("missingAt", ""))));
        values.put("created_at", payload.optString("created_at", payload.optString("createdAt", record.optString("updated_at"))));
        values.put("updated_at", record.optString("updated_at"));
        database.insertWithOnConflict("external_documents", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static JSONObject payload(JSONObject record) throws Exception {
        String payloadJson = record.optString("payload_json", "{}");
        return payloadJson.trim().isEmpty() ? new JSONObject() : new JSONObject(payloadJson);
    }

    private static String nullIfEmpty(String value) {
        return value == null || value.trim().isEmpty() ? null : value;
    }
}
