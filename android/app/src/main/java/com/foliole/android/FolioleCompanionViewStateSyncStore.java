package com.foliole.android;

import android.content.Context;
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
        String key = activeNodeKey(context);
        String objectId = objectId(deviceId, key);
        String contentHash = contentHash(deviceId, key, payload);
        database.beginTransaction();
        try {
            upsertActiveNode(context, database, nodeId, now);
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
        String key = nodeKeyPrefix(context) + nodeId;
        String objectId = objectId(deviceId, key);
        String contentHash = contentHash(deviceId, key, payload);
        database.beginTransaction();
        try {
            upsertNodeViewState(context, database, nodeId, deviceId, payload.optInt("scroll_top", 0), "user-scroll", now);
            writeSyncRows(context, database, objectId, deviceId, contentHash, payload, now);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        return result(objectId, contentHash);
    }

    static void applyPayload(Context context, SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        String key = objectIdKey(objectId);
        String deviceId = objectIdDeviceId(objectId);
        String activeKey = activeNodeKey(context);
        String nodePrefix = nodeKeyPrefix(context);
        if (!record.isNull("deleted_at")) {
            if (key.equals(activeKey)) {
                FolioleCompanionNamedMutationStore.execute(context, database, "syncViewActiveNodeDelete", new Object[] {});
            }
            if (key.startsWith(nodePrefix)) {
                FolioleCompanionNamedMutationStore.execute(context, database, "syncViewNodeStateDelete", new Object[] { key.substring(nodePrefix.length()), deviceId });
            }
            return;
        }
        JSONObject payload = payload(record);
        if (key.equals(activeKey)) {
            upsertActiveNode(context, database, nullIfEmpty(payload.optString("active_node_id", "")), record.optString("updated_at"));
        } else if (key.startsWith(nodePrefix)) {
            String source = payload.has("source") ? "sync-apply" : "user-scroll";
            upsertNodeViewState(context, database, key.substring(nodePrefix.length()), deviceId, payload.optInt("scroll_top", 0), source, record.optString("updated_at"));
        }
    }

    private static void writeSyncRows(Context context, SQLiteDatabase database, String objectId, String deviceId, String contentHash, JSONObject payload, String now) throws Exception {
        FolioleCompanionNamedMutationStore.upsertSyncStateRow(context, database, syncObjectType(context), objectId, null, contentHash, deviceId, now, null, 1);
    }

    private static void upsertActiveNode(Context context, SQLiteDatabase database, String nodeId, String now) throws Exception {
        FolioleCompanionNamedMutationStore.execute(context, database, "syncViewActiveNodeUpsert", new Object[] {
            "active_node_id",
            nodeId == null ? "" : nodeId,
            now
        });
    }

    private static void upsertNodeViewState(Context context, SQLiteDatabase database, String nodeId, String deviceId, int scrollTop, String source, String now) throws Exception {
        FolioleCompanionNamedMutationStore.execute(context, database, "syncViewNodeStateUpsert", new Object[] {
            nodeId,
            deviceId,
            Math.max(0, scrollTop),
            null,
            null,
            source,
            now
        });
    }

    private static String objectId(String deviceId, String key) {
        return SCOPE + ":" + PLATFORM + ":" + FORM_FACTOR + ":" + deviceId + ":" + key;
    }

    private static String activeNodeKey(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewActiveNodeKey(context);
    }

    private static String nodeKeyPrefix(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewNodeKeyPrefix(context);
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

    private static String syncObjectType(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncObjectType(context, "viewState");
    }
}
