package com.foliole.android;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.time.Instant;
import java.util.Iterator;

final class FolioleCompanionViewStateSyncStore {

    private static final String FORM_FACTOR = "phone";
    private static final String PLATFORM = "android";
    private static final String SCOPE = "session_resume";

    private FolioleCompanionViewStateSyncStore() {}

    static JSObject saveActiveNode(Context context, SQLiteDatabase database, JSONObject input, String deviceId) throws Exception {
        String nodeId = nullIfEmpty(input.optString("node_id", ""));
        JSONObject payload = new JSONObject();
        payload.put("active_node_id", nodeId == null ? JSONObject.NULL : nodeId);
        String now = Instant.now().toString();
        String objectId = objectId(deviceId, "active_node");
        String contentHash = contentHash(deviceId, "active_node", payload);
        database.beginTransaction();
        try {
            upsertActiveNode(database, nodeId, now);
            writeSyncRows(context, database, objectId, deviceId, contentHash, payload, now);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        return result(objectId, contentHash);
    }

    static JSObject saveNodeViewState(Context context, SQLiteDatabase database, JSONObject input, String deviceId) throws Exception {
        String nodeId = input.optString("node_id");
        JSONObject payload = new JSONObject();
        payload.put("node_id", nodeId);
        payload.put("scroll_top", Math.max(0, input.optInt("scroll_top", 0)));
        payload.put("selection_from", JSONObject.NULL);
        payload.put("selection_to", JSONObject.NULL);
        payload.put("source", "user-scroll");
        String now = Instant.now().toString();
        String objectId = objectId(deviceId, "node:" + nodeId);
        String contentHash = contentHash(deviceId, "node:" + nodeId, payload);
        database.beginTransaction();
        try {
            upsertNodeViewState(database, nodeId, deviceId, payload.optInt("scroll_top", 0), "user-scroll", now);
            writeSyncRows(context, database, objectId, deviceId, contentHash, payload, now);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        return result(objectId, contentHash);
    }

    static void applyPayload(SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        String key = objectIdKey(objectId);
        String deviceId = objectIdDeviceId(objectId);
        if (!record.isNull("deleted_at")) {
            if (key.equals("active_node")) database.delete("workspace_meta", "key = ?", new String[] { "active_node_id" });
            if (key.startsWith("node:")) {
                database.delete("node_view_state", "node_id = ? AND device_id = ?", new String[] { key.substring(5), deviceId });
            }
            return;
        }
        JSONObject payload = payload(record);
        if (key.equals("active_node")) {
            upsertActiveNode(database, nullIfEmpty(payload.optString("active_node_id", "")), record.optString("updated_at"));
        } else if (key.startsWith("node:")) {
            String source = payload.has("source") ? "sync-apply" : "user-scroll";
            upsertNodeViewState(database, key.substring(5), deviceId, payload.optInt("scroll_top", 0), source, record.optString("updated_at"));
        }
    }

    static String readPayloadJson(SQLiteDatabase database, String objectId) throws Exception {
        String key = objectIdKey(objectId);
        JSONObject payload = new JSONObject();
        if (key.equals("active_node")) {
            try (Cursor cursor = database.query("workspace_meta", new String[] { "value", "updated_at" }, "key = ?", new String[] { "active_node_id" }, null, null, null, "1")) {
                if (cursor.moveToFirst()) payload.put("active_node_id", nullIfEmpty(cursor.getString(0)));
            }
        } else if (key.startsWith("node:")) {
            copyNodeViewState(database, key.substring(5), objectIdDeviceId(objectId), payload);
        }
        return payload.toString();
    }

    private static void copyNodeViewState(SQLiteDatabase database, String nodeId, String deviceId, JSONObject payload) throws Exception {
        try (Cursor cursor = database.query("node_view_state", null, "node_id = ? AND device_id = ?", new String[] { nodeId, deviceId }, null, null, null, "1")) {
            if (!cursor.moveToFirst()) return;
            payload.put("node_id", nodeId);
            payload.put("scroll_top", cursor.getInt(cursor.getColumnIndexOrThrow("scroll_top")));
            payload.put("selection_from", JSONObject.NULL);
            payload.put("selection_to", JSONObject.NULL);
            payload.put("source", cursor.getString(cursor.getColumnIndexOrThrow("source")));
        }
    }

    private static void writeSyncRows(Context context, SQLiteDatabase database, String objectId, String deviceId, String contentHash, JSONObject payload, String now) throws Exception {
        FolioleCompanionNamedMutationStore.upsertSyncStateRow(context, database, "view_state", objectId, null, contentHash, deviceId, now, null, 1);
    }

    private static void upsertActiveNode(SQLiteDatabase database, String nodeId, String now) {
        ContentValues values = new ContentValues();
        values.put("key", "active_node_id");
        values.put("value", nodeId == null ? "" : nodeId);
        values.put("updated_at", now);
        database.insertWithOnConflict("workspace_meta", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void upsertNodeViewState(SQLiteDatabase database, String nodeId, String deviceId, int scrollTop, String source, String now) {
        ContentValues values = new ContentValues();
        values.put("node_id", nodeId);
        values.put("device_id", deviceId);
        values.put("scroll_top", Math.max(0, scrollTop));
        values.putNull("selection_from");
        values.putNull("selection_to");
        values.put("source", source);
        values.put("updated_at", now);
        database.insertWithOnConflict("node_view_state", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static String objectId(String deviceId, String key) {
        return SCOPE + ":" + PLATFORM + ":" + FORM_FACTOR + ":" + deviceId + ":" + key;
    }

    private static String objectIdKey(String objectId) {
        String[] parts = objectId.split(":", 5);
        return parts.length == 5 ? parts[4] : objectId;
    }

    private static String objectIdDeviceId(String objectId) {
        String[] parts = objectId.split(":", 5);
        return parts.length == 5 ? parts[3] : "*";
    }

    private static JSONObject payload(JSONObject record) throws Exception {
        return FolioleCompanionSyncPayloadJson.payload(record);
    }

    private static String contentHash(String deviceId, String key, JSONObject payload) throws Exception {
        JSONObject canonical = new JSONObject();
        canonical.put("device_id", deviceId);
        canonical.put("form_factor", FORM_FACTOR);
        canonical.put("key", key);
        canonical.put("platform", PLATFORM);
        canonical.put("scope", SCOPE);
        Iterator<String> payloadKeys = payload.keys();
        while (payloadKeys.hasNext()) {
            String payloadKey = payloadKeys.next();
            if (payloadKey.equals("source")) continue;
            canonical.put(payloadKey, payload.get(payloadKey));
        }
        return FolioleCompanionSyncContentHash.hash(canonical);
    }

    private static JSObject result(String objectId, String contentHash) {
        JSObject result = new JSObject();
        result.put("object_id", objectId);
        result.put("content_hash", contentHash);
        return result;
    }

    private static String nullIfEmpty(String value) {
        return value == null || value.trim().isEmpty() ? null : value;
    }
}
