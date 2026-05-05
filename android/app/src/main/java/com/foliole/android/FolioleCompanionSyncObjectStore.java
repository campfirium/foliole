package com.foliole.android;

import android.content.Context;
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

    static JSObject loadSyncIndex(Context context, SQLiteDatabase database) throws Exception {
        return FolioleCompanionNamedQueryStore.loadArray(context, database, "syncIndex");
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

    static JSObject loadSyncStateChanges(Context context, SQLiteDatabase database, int cursor, int limit) throws Exception {
        JSObject result = FolioleCompanionNamedQueryStore.loadArray(context, database, "syncStateChanges", new String[] {
            String.valueOf(Math.max(0, cursor)),
            String.valueOf(normalizeLimit(limit))
        });
        appendPayloads(database, result.getJSONArray("objects"));
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

    private static void appendPayloads(SQLiteDatabase database, JSONArray objects) throws Exception {
        for (int index = 0; index < objects.length(); index += 1) {
            JSONObject object = objects.getJSONObject(index);
            object.put("payload_json", object.isNull("deleted_at") ?
                FolioleCompanionSyncObjectPayloadReader.readPayloadJson(
                    database,
                    object.getString("object_type"),
                    object.getString("object_id")
                ) :
                JSONObject.NULL);
        }
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
