package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.time.Instant;

final class FolioleCompanionSyncStateWriteStore {

    private FolioleCompanionSyncStateWriteStore() {}

    static JSObject saveSetting(Context context, SQLiteDatabase database, JSONObject input, String modifiedByDeviceId) throws Exception {
        String now = Instant.now().toString();
        String key = FolioleCompanionSyncSettingPayloadRules.key(context, input);
        String scope = FolioleCompanionSyncSettingPayloadRules.scope(context, input);
        String platform = FolioleCompanionSyncSettingPayloadRules.platform(context, input);
        String formFactor = FolioleCompanionSyncSettingPayloadRules.formFactor(context, input);
        String deviceId = FolioleCompanionSyncSettingPayloadRules.deviceId(context, input);
        String valueJson = FolioleCompanionSyncSettingPayloadRules.valueJson(context, input);
        String objectId = FolioleCompanionSyncSettingPayloadRules.objectId(context, scope, platform, formFactor, deviceId, key);
        JSONObject payload = FolioleCompanionSyncSettingPayloadRules.payload(context, key, scope, platform, formFactor, deviceId, valueJson);
        String contentHash = FolioleCompanionSyncContentHash.hash(payload);

        database.beginTransaction();
        try {
            upsertSettingRecord(context, database, key, scope, platform, formFactor, deviceId, valueJson, contentHash, now);
            upsertObjectState(context, database, objectId, contentHash, modifiedByDeviceId, now);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        JSObject result = new JSObject();
        result.put("object_id", objectId);
        result.put("content_hash", contentHash);
        return result;
    }

    static JSObject saveNodeReading(Context context, SQLiteDatabase database, JSONObject input, String modifiedByDeviceId) throws Exception {
        String queryName = FolioleCompanionSyncPayloadQueryStore.nodeReadingPayloadQueryName();
        String nodeId = FolioleCompanionLearningPayloadRules.nodeId(context, input, queryName);
        JSONObject payload = FolioleCompanionLearningPayloadRules.inputPayload(context, input, queryName);
        String now = Instant.now().toString();
        FolioleCompanionLearningPayloadRules.put(context, payload, queryName, "nodeIdPayloadKey", nodeId);
        FolioleCompanionLearningPayloadRules.put(context, payload, queryName, "deviceIdPayloadKey", modifiedByDeviceId);
        JSONObject hashPayload = FolioleCompanionLearningPayloadRules.readingHashPayload(context, payload);
        String contentHash = FolioleCompanionSyncContentHash.hash(hashPayload);
        String objectType = syncObjectType(context, "nodeReading");
        database.beginTransaction();
        try {
            FolioleCompanionLearningSyncPayload.applyReading(context, database, nodeId, buildRecord(objectType, nodeId, payload, contentHash, now));
            upsertTypedObjectState(context, database, objectType, nodeId, contentHash, modifiedByDeviceId, now);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        return syncSaveResult(nodeId, contentHash);
    }

    static JSObject saveNodeReview(Context context, SQLiteDatabase database, JSONObject input, String modifiedByDeviceId) throws Exception {
        String queryName = FolioleCompanionSyncPayloadQueryStore.nodeReviewPayloadQueryName();
        String nodeId = FolioleCompanionLearningPayloadRules.nodeId(context, input, queryName);
        JSONObject payload = FolioleCompanionLearningPayloadRules.inputPayload(context, input, queryName);
        JSONObject reviewLog = FolioleCompanionLearningPayloadRules.reviewLogInput(context, input);
        String now = Instant.now().toString();
        FolioleCompanionLearningPayloadRules.put(context, payload, queryName, "nodeIdPayloadKey", nodeId);
        String contentHash = FolioleCompanionSyncContentHash.hash(payload);
        String opId = null;
        String objectType = syncObjectType(context, "nodeReview");
        database.beginTransaction();
        try {
            FolioleCompanionLearningSyncPayload.applyReview(context, database, nodeId, buildRecord(objectType, nodeId, payload, contentHash, now));
            if (reviewLog != null) {
                opId = FolioleCompanionSyncReviewLogStore.saveLocalReviewLog(context, database, nodeId, reviewLog, modifiedByDeviceId);
            }
            upsertTypedObjectState(context, database, objectType, nodeId, contentHash, modifiedByDeviceId, now);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        JSObject result = syncSaveResult(nodeId, contentHash);
        if (opId != null) {
            result.put("op_id", opId);
        }
        return result;
    }

    private static void upsertSettingRecord(
        Context context,
        SQLiteDatabase database,
        String key,
        String scope,
        String platform,
        String formFactor,
        String deviceId,
        String valueJson,
        String contentHash,
        String now
    ) throws Exception {
        FolioleCompanionNamedMutationStore.execute(context, database, "syncSettingRecordUpsert", new Object[] {
            key,
            scope,
            platform,
            formFactor,
            deviceId,
            valueJson,
            contentHash,
            now
        });
    }

    private static void upsertObjectState(Context context, SQLiteDatabase database, String objectId, String contentHash, String deviceId, String now) throws Exception {
        upsertTypedObjectState(context, database, syncObjectType(context, "settingRecord"), objectId, contentHash, deviceId, now);
    }

    private static void upsertTypedObjectState(
        Context context,
        SQLiteDatabase database,
        String objectType,
        String objectId,
        String contentHash,
        String deviceId,
        String now
    ) throws Exception {
        FolioleCompanionNamedMutationStore.upsertSyncStateRow(context, database, objectType, objectId, null, contentHash, deviceId, now, null, 1);
    }

    private static JSONObject buildRecord(
        String objectType,
        String objectId,
        JSONObject payload,
        String contentHash,
        String now
    ) throws Exception {
        JSONObject record = new JSONObject();
        record.put("object_type", objectType);
        record.put("object_id", objectId);
        record.put("content_hash", contentHash);
        record.put("payload_json", payload.toString());
        record.put("updated_at", now);
        return record;
    }

    private static JSObject syncSaveResult(String objectId, String contentHash) {
        JSObject result = new JSObject();
        result.put("object_id", objectId);
        result.put("content_hash", contentHash);
        return result;
    }

    private static String syncObjectType(Context context, String key) throws Exception {
        return FolioleCompanionSyncProtocolDefinitions.syncObjectType(context, key);
    }
}
