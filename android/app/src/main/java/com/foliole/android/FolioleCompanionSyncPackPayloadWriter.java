package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

final class FolioleCompanionSyncPackPayloadWriter {
    private FolioleCompanionSyncPackPayloadWriter() {}

    static void copy(SQLiteDatabase pack, JSONArray plans) throws Exception {
        Map<String, String> payloads = loadPayloads(pack, plans);
        try (Cursor states = pack.rawQuery(
            "SELECT object_type, object_id, content_hash, updated_at, deleted_at FROM sync_object_state " +
                "WHERE object_type NOT IN ('external_document','node')", null
        )) {
            while (states.moveToNext()) copyState(pack, payloads, states);
        }
    }

    private static Map<String, String> loadPayloads(SQLiteDatabase pack, JSONArray plans) throws Exception {
        Map<String, String> payloads = new HashMap<>();
        for (int index = 0; index < plans.length(); index++) {
            JSONObject plan = plans.getJSONObject(index);
            String objectType = plan.getString("objectType");
            try (Cursor rows = pack.rawQuery(plan.getString("sql"), null)) {
                int objectIdIndex = rows.getColumnIndexOrThrow("__object_id");
                while (rows.moveToNext()) {
                    payloads.put(key(objectType, rows.getString(objectIdIndex)), json(rows).toString());
                }
            }
        }
        return payloads;
    }

    private static void copyState(SQLiteDatabase pack, Map<String, String> payloads, Cursor state) throws Exception {
        String objectType = state.getString(0);
        String objectId = state.getString(1);
        String payload = state.isNull(4) ? payloads.get(key(objectType, objectId)) : null;
        if (state.isNull(4) && payload == null) return;
        ContentValues values = new ContentValues();
        values.put("object_type", objectType); values.put("object_id", objectId);
        values.put("content_hash", state.getString(2)); values.put("updated_at", state.getString(3));
        if (payload == null) values.putNull("payload_json"); else values.put("payload_json", payload);
        if (state.isNull(4)) values.putNull("deleted_at"); else values.put("deleted_at", state.getString(4));
        pack.insertOrThrow("sync_objects", null, values);
    }

    private static JSONObject json(Cursor row) throws Exception {
        JSONObject result = new JSONObject();
        for (int index = 0; index < row.getColumnCount(); index++) {
            if ("__object_id".equals(row.getColumnName(index))) continue;
            String[] path = row.getColumnName(index).split("__", 2);
            JSONObject target = result;
            if (path.length == 2) {
                if (!result.has(path[0])) result.put(path[0], new JSONObject());
                target = result.getJSONObject(path[0]);
            }
            target.put(path[path.length - 1], value(row, index));
        }
        return result;
    }

    private static String key(String objectType, String objectId) {
        return objectType + "\u0000" + objectId;
    }

    private static Object value(Cursor row, int index) {
        switch (row.getType(index)) {
            case Cursor.FIELD_TYPE_NULL: return JSONObject.NULL;
            case Cursor.FIELD_TYPE_INTEGER: return row.getLong(index);
            case Cursor.FIELD_TYPE_FLOAT: return row.getDouble(index);
            default: return row.getString(index);
        }
    }
}
