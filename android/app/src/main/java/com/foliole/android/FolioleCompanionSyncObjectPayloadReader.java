package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

final class FolioleCompanionSyncObjectPayloadReader {
    private FolioleCompanionSyncObjectPayloadReader() {}

    static String readPayloadJson(SQLiteDatabase database, String objectType, String objectId) throws Exception {
        JSONObject payload = new JSONObject();
        if (objectType.equals("attachment")) {
            return FolioleCompanionAttachmentSyncPayload.readPayloadJson(database, objectId);
        } else if (objectType.equals("external_document")) {
            copyRow(database, payload, "external_documents", "document_id = ?", new String[] { objectId });
        } else if (objectType.equals("import_source")) {
            copyRow(database, payload, "import_sources", "source_fingerprint = ?", new String[] { objectId });
        } else if (objectType.equals("external_folder")) {
            copyRow(database, payload, "external_search_folders", "id = ?", new String[] { objectId });
        } else if (objectType.equals("node_reading")) {
            copyRow(database, payload, "node_reading", "node_id = ?", new String[] { objectId });
        } else if (objectType.equals("node_review")) {
            copyRow(database, payload, "node_review", "node_id = ?", new String[] { objectId });
        } else if (objectType.equals("setting")) {
            copySettingRow(database, payload, objectId);
        } else if (objectType.equals("pdf_page_text")) {
            copyPdfPageTextRow(database, payload, objectId);
        } else if (objectType.equals("view_state")) {
            return FolioleCompanionViewStateSyncStore.readPayloadJson(database, objectId);
        }
        return payload.toString();
    }

    private static void copySettingRow(SQLiteDatabase database, JSONObject payload, String objectId) throws Exception {
        String[] parts = objectId.split(":", 5);
        if (parts.length == 5) {
            copyRow(database, payload, "setting_records",
                "scope = ? AND platform = ? AND form_factor = ? AND device_id = ? AND key = ?", parts);
        }
    }

    private static void copyPdfPageTextRow(SQLiteDatabase database, JSONObject payload, String objectId) throws Exception {
        String[] parts = objectId.split(":");
        copyRow(database, payload, "pdf_page_text", "attachment_id = ? AND page = ?",
            new String[] { parts[0], parts.length > 1 ? parts[parts.length - 1] : "0" });
    }

    private static void copyRow(SQLiteDatabase database, JSONObject payload, String table, String where, String[] args) throws Exception {
        try (Cursor cursor = database.query(table, null, where, args, null, null, null, "1")) {
            if (!cursor.moveToFirst()) {
                return;
            }
            for (int index = 0; index < cursor.getColumnCount(); index += 1) {
                putColumnValue(payload, cursor, index);
            }
        }
    }

    private static void putColumnValue(JSONObject payload, Cursor cursor, int columnIndex) throws Exception {
        String name = cursor.getColumnName(columnIndex);
        int type = cursor.getType(columnIndex);
        if (type == Cursor.FIELD_TYPE_NULL) {
            payload.put(name, JSONObject.NULL);
        } else if (type == Cursor.FIELD_TYPE_INTEGER) {
            payload.put(name, cursor.getLong(columnIndex));
        } else if (type == Cursor.FIELD_TYPE_FLOAT) {
            payload.put(name, cursor.getDouble(columnIndex));
        } else {
            payload.put(name, cursor.getString(columnIndex));
        }
    }
}
