package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

final class FolioleCompanionSyncObjectStore {

    private FolioleCompanionSyncObjectStore() {}

    static JSObject loadSyncIndex(SQLiteDatabase database) throws Exception {
        JSArray entries = new JSArray();
        try (Cursor cursor = database.rawQuery(
            "SELECT object_type, object_id, current_version_id, content_hash, updated_at " +
                "FROM sync_object_state WHERE object_type <> 'node' ORDER BY updated_at ASC, object_type ASC, object_id ASC",
            null
        )) {
            while (cursor.moveToNext()) {
                JSObject entry = new JSObject();
                entry.put("object_type", cursor.getString(0));
                entry.put("object_id", cursor.getString(1));
                entry.put("sync_version_id", cursor.isNull(2) ? JSONObject.NULL : cursor.getString(2));
                entry.put("content_hash", cursor.getString(3));
                entry.put("updated_at", cursor.getString(4));
                entries.put(entry);
            }
        }
        JSObject result = new JSObject();
        result.put("entries", entries);
        return result;
    }

    static JSObject loadSyncObjects(SQLiteDatabase database, JSONArray objectIds, JSONArray objectTypes) throws Exception {
        JSArray objects = new JSArray();
        for (SyncStateRow row : readStateRows(database, objectIds, objectTypes)) {
            JSObject object = new JSObject();
            object.put("object_type", row.objectType);
            object.put("object_id", row.objectId);
            object.put("content_hash", row.contentHash);
            object.put("updated_at", row.updatedAt);
            object.put("deleted_at", row.deletedAt == null ? JSONObject.NULL : row.deletedAt);
            object.put("payload_json", row.deletedAt == null ? readPayloadJson(database, row.objectType, row.objectId) : JSONObject.NULL);
            objects.put(object);
        }
        JSObject result = new JSObject();
        result.put("objects", objects);
        return result;
    }

    static JSObject applySyncObjects(SQLiteDatabase database, JSONArray objects, String deviceId) throws Exception {
        JSArray appliedObjectIds = new JSArray();
        if (objects == null) {
            JSObject result = new JSObject();
            result.put("applied_object_ids", appliedObjectIds);
            return result;
        }
        database.beginTransaction();
        try {
            for (int index = 0; index < objects.length(); index += 1) {
                JSONObject object = objects.optJSONObject(index);
                if (object == null) {
                    continue;
                }
                FolioleCompanionSyncObjectApply.applyPayload(database, object);
                upsertState(database, object, deviceId);
                appliedObjectIds.put(object.optString("object_type") + ":" + object.optString("object_id"));
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        JSObject result = new JSObject();
        result.put("applied_object_ids", appliedObjectIds);
        return result;
    }

    private static List<SyncStateRow> readStateRows(SQLiteDatabase database, JSONArray objectIds, JSONArray objectTypes) {
        List<String> ids = toStringList(objectIds);
        List<String> types = toStringList(objectTypes);
        List<SyncStateRow> rows = new ArrayList<>();
        if (ids.isEmpty()) {
            return rows;
        }
        StringBuilder sql = new StringBuilder(
            "SELECT object_type, object_id, content_hash, updated_at, deleted_at FROM sync_object_state " +
                "WHERE object_type <> 'node' AND object_id IN (" + placeholders(ids.size()) + ")"
        );
        List<String> args = new ArrayList<>(ids);
        if (!types.isEmpty()) {
            sql.append(" AND object_type IN (").append(placeholders(types.size())).append(")");
            args.addAll(types);
        }
        sql.append(" ORDER BY updated_at ASC, object_type ASC, object_id ASC");
        try (Cursor cursor = database.rawQuery(sql.toString(), args.toArray(new String[0]))) {
            while (cursor.moveToNext()) {
                rows.add(new SyncStateRow(
                    cursor.getString(0),
                    cursor.getString(1),
                    cursor.getString(2),
                    cursor.getString(3),
                    cursor.isNull(4) ? null : cursor.getString(4)
                ));
            }
        }
        return rows;
    }

    private static String readPayloadJson(SQLiteDatabase database, String objectType, String objectId) throws Exception {
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
            String[] parts = objectId.split(":", 5);
            if (parts.length == 5) {
                copyRow(database, payload, "setting_records",
                    "scope = ? AND platform = ? AND form_factor = ? AND device_id = ? AND key = ?", parts);
            }
        } else if (objectType.equals("pdf_page_text")) {
            String[] parts = objectId.split(":");
            copyRow(database, payload, "pdf_page_text", "attachment_id = ? AND page = ?",
                new String[] { parts[0], parts.length > 1 ? parts[parts.length - 1] : "0" });
        } else if (objectType.equals("view_state")) {
            return FolioleCompanionViewStateSyncStore.readPayloadJson(database, objectId);
        }
        return payload.toString();
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

    private static void upsertState(SQLiteDatabase database, JSONObject record, String deviceId) {
        ContentValues values = new ContentValues();
        values.put("object_type", record.optString("object_type"));
        values.put("object_id", record.optString("object_id"));
        values.put("current_version_id", nullIfEmpty(record.optString("sync_version_id", "")));
        values.put("content_hash", record.optString("content_hash"));
        values.put("last_modified_by_device_id", deviceId);
        values.put("updated_at", record.optString("updated_at"));
        values.put("deleted_at", nullIfEmpty(record.optString("deleted_at", "")));
        values.put("sync_dirty", 0);
        database.insertWithOnConflict("sync_object_state", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static List<String> toStringList(JSONArray values) {
        List<String> strings = new ArrayList<>();
        if (values == null) return strings;
        for (int index = 0; index < values.length(); index += 1) {
            String value = values.optString(index, "").trim();
            if (!value.isEmpty()) strings.add(value);
        }
        return strings;
    }

    private static String placeholders(int count) {
        List<String> placeholders = new ArrayList<>();
        for (int index = 0; index < count; index += 1) placeholders.add("?");
        return String.join(",", placeholders);
    }

    private static String nullIfEmpty(String value) {
        return value == null || value.trim().isEmpty() ? null : value;
    }

    private static final class SyncStateRow {
        final String objectType;
        final String objectId;
        final String contentHash;
        final String updatedAt;
        final String deletedAt;

        SyncStateRow(String objectType, String objectId, String contentHash, String updatedAt, String deletedAt) {
            this.objectType = objectType;
            this.objectId = objectId;
            this.contentHash = contentHash;
            this.updatedAt = updatedAt;
            this.deletedAt = deletedAt;
        }
    }
}
