package com.foliole.android;

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
        object.put("payload_json", row.deletedAt == null ?
            FolioleCompanionSyncObjectPayloadReader.readPayloadJson(database, row.objectType, row.objectId) :
            JSONObject.NULL);
        if (includeStateSeq) {
            object.put("state_seq", row.stateSeq);
            object.put("base_content_hash", row.baseContentHash == null ? JSONObject.NULL : row.baseContentHash);
        }
        return object;
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
