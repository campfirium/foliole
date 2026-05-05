package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

final class FolioleCompanionSyncObjectStore {
    private static final String TAG = "FolioleSyncObjects";

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
            objects.put(toSyncObject(database, row, false));
        }
        JSObject result = new JSObject();
        result.put("objects", objects);
        return result;
    }

    static JSObject loadSyncStateChanges(SQLiteDatabase database, int cursor, int limit) throws Exception {
        JSArray objects = new JSArray();
        try (Cursor row = database.rawQuery(
            "SELECT object_type, object_id, state_seq, content_hash, updated_at, deleted_at, base_content_hash " +
                "FROM sync_object_state WHERE object_type <> 'node' AND sync_dirty = 1 AND state_seq > ? " +
                "AND NOT EXISTS (SELECT 1 FROM sync_push_ack ack WHERE ack.object_type = sync_object_state.object_type " +
                "AND ack.object_id = sync_object_state.object_id) ORDER BY state_seq ASC LIMIT ?",
            new String[] { String.valueOf(Math.max(0, cursor)), String.valueOf(normalizeLimit(limit)) }
        )) {
            while (row.moveToNext()) {
                objects.put(toSyncObject(database, new SyncStateRow(
                    row.getString(0),
                    row.getString(1),
                    row.getString(3),
                    row.getString(4),
                    row.isNull(5) ? null : row.getString(5),
                    row.getInt(2),
                    row.isNull(6) ? null : row.getString(6)
                ), true));
            }
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
        for (int index = 0; index < objects.length(); index += 1) {
            JSONObject object = objects.optJSONObject(index);
            if (object == null) {
                Log.w(TAG, "Skipped invalid sync object at index " + index);
                continue;
            }
            try {
                String appliedObjectId = applySingleSyncObject(database, object, deviceId);
                if (appliedObjectId != null) {
                    appliedObjectIds.put(appliedObjectId);
                }
            } catch (Exception error) {
                Log.w(TAG, "Skipped sync object " + object.optString("object_type") + ":" + object.optString("object_id"), error);
            }
        }
        JSObject result = new JSObject();
        result.put("applied_object_ids", appliedObjectIds);
        return result;
    }

    private static String applySingleSyncObject(SQLiteDatabase database, JSONObject object, String deviceId) throws Exception {
        validateSyncObjectRecord(object);
        database.beginTransaction();
        try {
            if (!shouldApplyObject(database, object)) {
                database.setTransactionSuccessful();
                return null;
            }
            FolioleCompanionSyncObjectApply.applyPayload(database, object);
            upsertState(database, object, deviceId);
            database.setTransactionSuccessful();
            return object.optString("object_type") + ":" + object.optString("object_id");
        } finally {
            database.endTransaction();
        }
    }

    private static void validateSyncObjectRecord(JSONObject object) throws Exception {
        String objectType = requireString(object, "object_type");
        if (!isStateObjectType(objectType)) {
            throw new IllegalArgumentException("Unsupported sync object type: " + objectType);
        }
        requireString(object, "object_id");
        requireString(object, "content_hash");
        requireString(object, "updated_at");
        Object deletedAt = requireNullableString(object, "deleted_at");
        Object payloadJson = requireNullableString(object, "payload_json");
        if (deletedAt == JSONObject.NULL && payloadJson == JSONObject.NULL) {
            throw new IllegalArgumentException("Invalid sync object payload_json");
        }
    }

    private static String requireString(JSONObject object, String key) throws Exception {
        if (!object.has(key) || object.isNull(key)) {
            throw new IllegalArgumentException("Invalid sync object " + key);
        }
        String value = object.getString(key).trim();
        if (value.isEmpty()) {
            throw new IllegalArgumentException("Invalid sync object " + key);
        }
        return value;
    }

    private static Object requireNullableString(JSONObject object, String key) throws Exception {
        if (!object.has(key)) {
            throw new IllegalArgumentException("Invalid sync object " + key);
        }
        Object value = object.get(key);
        if (value == JSONObject.NULL) {
            return value;
        }
        if (!(value instanceof String) || ((String) value).trim().isEmpty()) {
            throw new IllegalArgumentException("Invalid sync object " + key);
        }
        return value;
    }

    private static boolean isStateObjectType(String type) {
        return type.equals("attachment") ||
            type.equals("external_document") ||
            type.equals("external_folder") ||
            type.equals("import_source") ||
            type.equals("node_reading") ||
            type.equals("node_review") ||
            type.equals("pdf_page_text") ||
            type.equals("setting") ||
            type.equals("view_state");
    }

    private static boolean shouldApplyObject(SQLiteDatabase database, JSONObject object) {
        try (Cursor cursor = database.query(
            "sync_object_state",
            new String[] { "content_hash", "deleted_at", "updated_at" },
            "object_type = ? AND object_id = ?",
            new String[] { object.optString("object_type"), object.optString("object_id") },
            null,
            null,
            null,
            "1"
        )) {
            if (!cursor.moveToFirst()) {
                return true;
            }
            String currentHash = cursor.getString(0);
            String currentDeletedAt = cursor.isNull(1) ? null : cursor.getString(1);
            String nextDeletedAt = nullIfEmpty(object.optString("deleted_at", ""));
            if (currentHash.equals(object.optString("content_hash")) && sameNullableString(currentDeletedAt, nextDeletedAt)) {
                return false;
            }
            return cursor.getString(2).compareTo(object.optString("updated_at")) <= 0;
        }
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
                    cursor.isNull(4) ? null : cursor.getString(4),
                    0,
                    null
                ));
            }
        }
        return rows;
    }

    private static JSObject toSyncObject(SQLiteDatabase database, SyncStateRow row, boolean includeStateSeq) throws Exception {
        JSObject object = new JSObject();
        object.put("object_type", row.objectType);
        object.put("object_id", row.objectId);
        object.put("content_hash", row.contentHash);
        object.put("updated_at", row.updatedAt);
        object.put("deleted_at", row.deletedAt == null ? JSONObject.NULL : row.deletedAt);
        object.put("payload_json", row.deletedAt == null ? readPayloadJson(database, row.objectType, row.objectId) : JSONObject.NULL);
        if (includeStateSeq) {
            object.put("state_seq", row.stateSeq);
            object.put("base_content_hash", row.baseContentHash == null ? JSONObject.NULL : row.baseContentHash);
        }
        return object;
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
        FolioleCompanionSyncStateRows.upsert(
            database,
            record.optString("object_type"),
            record.optString("object_id"),
            nullIfEmpty(record.optString("sync_version_id", "")),
            record.optString("content_hash"),
            deviceId,
            record.optString("updated_at"),
            nullIfEmpty(record.optString("deleted_at", "")),
            0
        );
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

    private static int normalizeLimit(int limit) {
        return Math.max(1, Math.min(1000, limit <= 0 ? 500 : limit));
    }

    private static String nullIfEmpty(String value) {
        return value == null || value.trim().isEmpty() || value.equals("null") ? null : value;
    }

    private static boolean sameNullableString(String left, String right) {
        if (left == null) return right == null;
        return left.equals(right);
    }

    private static final class SyncStateRow {
        final String objectType;
        final String objectId;
        final String contentHash;
        final String updatedAt;
        final String deletedAt;
        final int stateSeq;
        final String baseContentHash;

        SyncStateRow(
            String objectType,
            String objectId,
            String contentHash,
            String updatedAt,
            String deletedAt,
            int stateSeq,
            String baseContentHash
        ) {
            this.objectType = objectType;
            this.objectId = objectId;
            this.contentHash = contentHash;
            this.updatedAt = updatedAt;
            this.deletedAt = deletedAt;
            this.stateSeq = stateSeq;
            this.baseContentHash = baseContentHash;
        }
    }
}
