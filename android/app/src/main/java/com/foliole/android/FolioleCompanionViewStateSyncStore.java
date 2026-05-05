package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.time.Instant;
import java.util.Iterator;
import java.util.Set;

final class FolioleCompanionViewStateSyncStore {

    private FolioleCompanionViewStateSyncStore() {}

    static JSObject saveActiveNode(Context context, SQLiteDatabase database, JSONObject input, String deviceId) throws Exception {
        String nodeId = nullIfEmpty(input.optString(nodeIdPayloadKey(context), ""));
        JSONObject payload = new JSONObject();
        payload.put(activeNodePayloadKey(context), nodeId == null ? JSONObject.NULL : nodeId);
        String now = Instant.now().toString();
        String key = activeNodeKey(context);
        String objectId = FolioleCompanionSyncPayloadQueryStore.viewObjectId(context, deviceId, key);
        String contentHash = contentHash(context, deviceId, key, payload);
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
        String nodeIdKey = nodeIdPayloadKey(context);
        String scrollTopKey = scrollTopPayloadKey(context);
        String source = localSource(context);
        String nodeId = input.optString(nodeIdKey);
        JSONObject payload = new JSONObject();
        payload.put(nodeIdKey, nodeId);
        payload.put(scrollTopKey, Math.max(0, input.optInt(scrollTopKey, 0)));
        payload.put(selectionFromPayloadKey(context), JSONObject.NULL);
        payload.put(selectionToPayloadKey(context), JSONObject.NULL);
        payload.put(sourcePayloadKey(context), source);
        String now = Instant.now().toString();
        String key = nodeKeyPrefix(context) + nodeId;
        String objectId = FolioleCompanionSyncPayloadQueryStore.viewObjectId(context, deviceId, key);
        String contentHash = contentHash(context, deviceId, key, payload);
        database.beginTransaction();
        try {
            upsertNodeViewState(context, database, nodeId, deviceId, payload.optInt(scrollTopKey, 0), source, now);
            writeSyncRows(context, database, objectId, deviceId, contentHash, payload, now);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        return result(objectId, contentHash);
    }

    static void applyPayload(Context context, SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        String key = FolioleCompanionSyncPayloadQueryStore.viewObjectIdKey(context, objectId);
        String deviceId = FolioleCompanionSyncPayloadQueryStore.viewObjectIdDeviceId(context, objectId);
        String activeKey = activeNodeKey(context);
        if (!record.isNull("deleted_at")) {
            if (key.equals(activeKey)) {
                FolioleCompanionNamedMutationStore.execute(context, database, mutationRule(context, "activeNodeDeleteMutationName"), new Object[] {});
            }
            if (FolioleCompanionSyncPayloadQueryStore.isViewNodeKey(context, key)) {
                FolioleCompanionNamedMutationStore.execute(
                    context,
                    database,
                    mutationRule(context, "nodeStateDeleteMutationName"),
                    new Object[] { FolioleCompanionSyncPayloadQueryStore.viewNodeIdFromKey(context, key), deviceId }
                );
            }
            return;
        }
        JSONObject payload = payload(record);
        if (key.equals(activeKey)) {
            upsertActiveNode(context, database, nullIfEmpty(payload.optString(activeNodePayloadKey(context), "")), record.optString("updated_at"));
        } else if (FolioleCompanionSyncPayloadQueryStore.isViewNodeKey(context, key)) {
            String sourceKey = sourcePayloadKey(context);
            String source = payload.has(sourceKey) ? syncAppliedSource(context) : localSource(context);
            upsertNodeViewState(
                context,
                database,
                FolioleCompanionSyncPayloadQueryStore.viewNodeIdFromKey(context, key),
                deviceId,
                payload.optInt(scrollTopPayloadKey(context), 0),
                source,
                record.optString("updated_at")
            );
        }
    }

    private static void writeSyncRows(Context context, SQLiteDatabase database, String objectId, String deviceId, String contentHash, JSONObject payload, String now) throws Exception {
        FolioleCompanionNamedMutationStore.upsertSyncStateRow(context, database, syncObjectType(context), objectId, null, contentHash, deviceId, now, null, 1);
    }

    private static void upsertActiveNode(Context context, SQLiteDatabase database, String nodeId, String now) throws Exception {
        FolioleCompanionNamedMutationStore.execute(context, database, mutationRule(context, "activeNodeUpsertMutationName"), new Object[] {
            FolioleCompanionSyncPayloadQueryStore.viewActiveNodeWorkspaceMetaKey(context),
            nodeId == null ? "" : nodeId,
            now
        });
    }

    private static void upsertNodeViewState(Context context, SQLiteDatabase database, String nodeId, String deviceId, int scrollTop, String source, String now) throws Exception {
        FolioleCompanionNamedMutationStore.execute(context, database, mutationRule(context, "nodeStateUpsertMutationName"), new Object[] {
            nodeId,
            deviceId,
            Math.max(0, scrollTop),
            null,
            null,
            source,
            now
        });
    }

    private static String activeNodeKey(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewActiveNodeKey(context);
    }

    private static String activeNodePayloadKey(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewActiveNodePayloadKey(context);
    }

    private static String formFactor(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewFormFactor(context);
    }

    private static Set<String> hashIgnoredPayloadKeys(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewHashIgnoredPayloadKeys(context);
    }

    private static String localSource(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewLocalSource(context);
    }

    private static String nodeIdPayloadKey(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewNodeIdPayloadKey(context);
    }

    private static String nodeKeyPrefix(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewNodeKeyPrefix(context);
    }

    private static String platform(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewPlatform(context);
    }

    private static String scope(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewScope(context);
    }

    private static String scrollTopPayloadKey(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewScrollTopPayloadKey(context);
    }

    private static String selectionFromPayloadKey(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewSelectionFromPayloadKey(context);
    }

    private static String selectionToPayloadKey(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewSelectionToPayloadKey(context);
    }

    private static String sourcePayloadKey(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewSourcePayloadKey(context);
    }

    private static String syncAppliedSource(Context context) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.viewSyncAppliedSource(context);
    }

    private static JSONObject payload(JSONObject record) throws Exception {
        return FolioleCompanionSyncPayloadJson.payload(record);
    }

    private static String contentHash(Context context, String deviceId, String key, JSONObject payload) throws Exception {
        JSONObject canonical = new JSONObject();
        canonical.put("device_id", deviceId);
        canonical.put("form_factor", formFactor(context));
        canonical.put("key", key);
        canonical.put("platform", platform(context));
        canonical.put("scope", scope(context));
        Set<String> ignoredPayloadKeys = hashIgnoredPayloadKeys(context);
        Iterator<String> payloadKeys = payload.keys();
        while (payloadKeys.hasNext()) {
            String payloadKey = payloadKeys.next();
            if (ignoredPayloadKeys.contains(payloadKey)) continue;
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

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionSyncApplyMutationRules.string(context, "viewState", key);
    }

    private static String syncObjectType(Context context) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncObjectType(context, "viewState");
    }
}
