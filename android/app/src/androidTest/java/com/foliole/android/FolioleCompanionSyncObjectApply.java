package com.foliole.android;

import android.content.ContentValues;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;

final class FolioleCompanionSyncObjectApply {

    private FolioleCompanionSyncObjectApply() {}

    static void applyPayload(SQLiteDatabase database, JSONObject record) throws Exception {
        String type = record.optString("object_type");
        String objectId = record.optString("object_id");
        if (type.equals("attachment")) {
            applyAttachment(database, objectId, record);
        } else if (type.equals("import_source")) {
            applyImportSource(database, objectId, record);
        } else if (type.equals("external_folder")) {
            applyExternalFolder(database, objectId, record);
        } else if (type.equals("external_document")) {
            FolioleCompanionDocumentSyncPayload.apply(
                InstrumentationRegistry.getInstrumentation().getTargetContext(),
                database,
                objectId,
                record
            );
        } else if (type.equals("node_reading")) {
            FolioleCompanionLearningSyncPayload.applyReading(InstrumentationRegistry.getInstrumentation().getTargetContext(), database, objectId, record);
        } else if (type.equals("node_review")) {
            FolioleCompanionLearningSyncPayload.applyReview(InstrumentationRegistry.getInstrumentation().getTargetContext(), database, objectId, record);
        } else if (type.equals("setting")) {
            applySetting(database, objectId, record);
        } else if (type.equals("pdf_page_text")) {
            applyPdfPageText(database, objectId, record);
        } else if (type.equals("view_state")) {
            FolioleCompanionViewStateSyncStore.applyPayload(InstrumentationRegistry.getInstrumentation().getTargetContext(), database, objectId, record);
        } else {
            throw new IllegalArgumentException("Unsupported sync object type: " + type);
        }
    }

    private static void applyAttachment(SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        if (!record.isNull("deleted_at")) {
            database.delete("pdf_page_text", "attachment_id = ?", new String[] { objectId });
            database.delete("attachment_blobs", "attachment_id = ?", new String[] { objectId });
            database.delete("attachments", "id = ?", new String[] { objectId });
            return;
        }
        JSONObject payload = payload(record);
        JSONObject blob = payload.optJSONObject("blob");
        ContentValues attachment = new ContentValues();
        attachment.put("id", objectId);
        attachment.put("original_name", nullIfEmpty(payload.optString("original_name", "")));
        attachment.put("mime_type", nullIfEmpty(payload.optString("mime_type", "")));
        attachment.put("size_bytes", payload.optLong("size_bytes", 0));
        attachment.put("created_at", payload.optString("created_at", record.optString("updated_at")));
        database.insertWithOnConflict("attachments", null, attachment, SQLiteDatabase.CONFLICT_REPLACE);

        ContentValues manifest = new ContentValues();
        manifest.put("attachment_id", objectId);
        manifest.put("content_hash", blob == null ? null : nullIfEmpty(blob.optString("content_hash", "")));
        manifest.put("storage_key", blob == null ? null : nullIfEmpty(blob.optString("storage_key", "")));
        manifest.put("size_bytes", blob == null ? attachment.getAsLong("size_bytes") : blob.optLong("size_bytes", 0));
        manifest.put("mime_type", blob == null ? attachment.getAsString("mime_type") : nullIfEmpty(blob.optString("mime_type", "")));
        manifest.put("availability", resolveAttachmentAvailability(blob));
        manifest.put("source_device_id", blob == null ? null : nullIfEmpty(blob.optString("source_device_id", "")));
        manifest.put("created_at", blob == null ? record.optString("updated_at") : blob.optString("created_at", record.optString("updated_at")));
        manifest.put("cached_at", blob == null ? null : nullIfEmpty(blob.optString("cached_at", "")));
        manifest.put("last_verified_at", blob == null ? null : nullIfEmpty(blob.optString("last_verified_at", "")));
        database.insertWithOnConflict("attachment_blobs", null, manifest, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static String resolveAttachmentAvailability(JSONObject blob) {
        if (blob == null) {
            return "remote_known";
        }
        String availability = blob.optString("availability", "remote_known");
        return availability.equals("local") ? "remote_known" : availability;
    }

    static JSONObject payload(JSONObject record) throws Exception {
        Object payloadValue = record.opt("payload_json");
        if (payloadValue == null || payloadValue == JSONObject.NULL) {
            return new JSONObject();
        }
        if (payloadValue instanceof JSONObject) {
            return (JSONObject) payloadValue;
        }
        String payloadJson = payloadValue.toString().trim();
        return payloadJson.isEmpty() || payloadJson.equals("null") ? new JSONObject() : new JSONObject(payloadJson);
    }

    private static void applyImportSource(SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        if (!record.isNull("deleted_at")) {
            database.delete("import_sources", "source_fingerprint = ?", new String[] { objectId });
            return;
        }
        JSONObject payload = payload(record);
        ContentValues values = new ContentValues();
        values.put("source_fingerprint", objectId);
        values.put("provider", payload.optString("provider", "unknown"));
        values.put("source_kind", payload.optString("source_kind", "unknown"));
        values.put("source_name", payload.optString("source_name", objectId));
        values.put("source_locator", payload.optString("source_locator", objectId));
        values.put("first_imported_at", payload.optString("first_imported_at", record.optString("updated_at")));
        values.put("last_imported_at", payload.optString("last_imported_at", record.optString("updated_at")));
        values.put("last_content_fingerprint", payload.optString("last_content_fingerprint", record.optString("content_hash")));
        values.put("latest_node_id", nullIfEmpty(payload.optString("latest_node_id", "")));
        database.insertWithOnConflict("import_sources", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void applyExternalFolder(SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        if (!record.isNull("deleted_at")) {
            database.delete("external_search_folders", "id = ?", new String[] { objectId });
            return;
        }
        JSONObject payload = payload(record);
        ContentValues values = new ContentValues();
        values.put("id", objectId);
        values.put("folder_path", payload.optString("folder_path", ""));
        values.put("attachment_mode", payload.optString("attachment_mode", "document_relative_first_then_fixed_root"));
        values.put("attachment_root_path", nullIfEmpty(payload.optString("attachment_root_path", "")));
        values.put("excluded_dirs_json", payload.optString("excluded_dirs_json", "[]"));
        values.put("status", payload.optString("status", "idle"));
        values.put("document_count", payload.optInt("document_count", 0));
        values.put("indexed_at", nullIfEmpty(payload.optString("indexed_at", "")));
        values.put("last_error", nullIfEmpty(payload.optString("last_error", "")));
        values.put("created_at", payload.optString("created_at", record.optString("updated_at")));
        values.put("updated_at", record.optString("updated_at"));
        database.insertWithOnConflict("external_search_folders", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void applySetting(SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        if (!record.isNull("deleted_at")) {
            String[] deletedParts = objectId.split(":", 5);
            database.delete(
                "setting_records",
                "scope = ? AND platform = ? AND form_factor = ? AND device_id = ? AND key = ?",
                new String[] {
                    deletedParts.length > 0 ? deletedParts[0] : "device",
                    deletedParts.length > 1 ? deletedParts[1] : "*",
                    deletedParts.length > 2 ? deletedParts[2] : "*",
                    deletedParts.length > 3 ? deletedParts[3] : "*",
                    deletedParts.length > 4 ? deletedParts[4] : objectId
                }
            );
            return;
        }
        JSONObject payload = payload(record);
        String[] parts = objectId.split(":", 5);
        ContentValues values = new ContentValues();
        values.put("scope", payload.optString("scope", parts.length > 0 ? parts[0] : "device"));
        values.put("platform", payload.optString("platform", parts.length > 1 ? parts[1] : "*"));
        values.put("form_factor", payload.optString("form_factor", parts.length > 2 ? parts[2] : "*"));
        values.put("device_id", payload.optString("device_id", parts.length > 3 ? parts[3] : "*"));
        values.put("key", payload.optString("key", parts.length > 4 ? parts[4] : objectId));
        values.put("value_json", payload.optString("value_json", "null"));
        values.put("content_hash", record.optString("content_hash"));
        values.put("updated_at", record.optString("updated_at"));
        values.put("deleted_at", nullIfEmpty(record.optString("deleted_at", "")));
        database.insertWithOnConflict("setting_records", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void applyPdfPageText(SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        String[] parts = objectId.split(":");
        String attachmentId = parts[0];
        String page = parts.length > 1 ? parts[parts.length - 1] : "0";
        if (!record.isNull("deleted_at")) {
            database.delete("pdf_page_text", "attachment_id = ? AND page = ?", new String[] { attachmentId, page });
            return;
        }
        JSONObject payload = payload(record);
        ContentValues values = new ContentValues();
        values.put("attachment_id", payload.optString("attachment_id", attachmentId));
        values.put("page", payload.optInt("page", Integer.parseInt(page)));
        values.put("text", payload.optString("text", ""));
        values.put("page_width", payload.optDouble("page_width", 0));
        values.put("page_height", payload.optDouble("page_height", 0));
        database.insertWithOnConflict("pdf_page_text", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static String nullIfEmpty(String value) {
        return value == null || value.trim().isEmpty() ? null : value;
    }
}
