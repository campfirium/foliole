package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.util.UUID;

final class FolioleCompanionSyncReviewLogStore {

    private FolioleCompanionSyncReviewLogStore() {}

    static JSObject loadReviewLog(Context context, SQLiteDatabase database, JSONObject cursor, int limit, String deviceId) throws Exception {
        return FolioleCompanionGeneratedQueryRunner.load(
            context,
            database,
            FolioleCompanionSyncStreamQueryRules.reviewLogQueryName(context),
            FolioleCompanionSyncStreamQueryRules.cursorArgs(context, "reviewLog", cursor, deviceId, limit)
        );
    }

    static String saveLocalReviewLog(
        Context context,
        SQLiteDatabase database,
        String nodeId,
        JSONObject draft,
        String deviceId
    ) throws Exception {
        String opId = UUID.randomUUID().toString();
        JSONObject cardBefore = draft.getJSONObject(draftKey(context, "reviewLogCardBeforeInputKey"));
        JSONObject cardAfter = draft.getJSONObject(draftKey(context, "reviewLogCardAfterInputKey"));
        String queryName = FolioleCompanionSyncStreamQueryRules.reviewLogQueryName(context);
        JSONObject record = new JSONObject();
        record.put(recordKey(context, queryName, "id"), UUID.randomUUID().toString());
        record.put(recordKey(context, queryName, "op_id"), opId);
        record.put(recordKey(context, queryName, "device_id"), deviceId);
        record.put(recordKey(context, queryName, "node_id"), nodeId);
        record.put(recordKey(context, queryName, "grade"), draft.getInt(draftKey(context, "reviewLogGradeInputKey")));
        record.put(recordKey(context, queryName, "scheduler_version"), draft.optString(draftKey(context, "reviewLogSchedulerVersionInputKey"), ""));
        record.put(recordKey(context, queryName, "reviewed_at"), draft.getString(draftKey(context, "reviewLogReviewedAtInputKey")));
        record.put(recordKey(context, queryName, "due_before"), cardBefore.getString(draftKey(context, "reviewLogDueInputKey")));
        record.put(recordKey(context, queryName, "stability_before"), cardBefore.getDouble(draftKey(context, "reviewLogStabilityInputKey")));
        record.put(recordKey(context, queryName, "difficulty_before"), cardBefore.getDouble(draftKey(context, "reviewLogDifficultyInputKey")));
        record.put(recordKey(context, queryName, "due_after"), cardAfter.getString(draftKey(context, "reviewLogDueInputKey")));
        record.put(recordKey(context, queryName, "stability_after"), cardAfter.getDouble(draftKey(context, "reviewLogStabilityInputKey")));
        record.put(recordKey(context, queryName, "difficulty_after"), cardAfter.getDouble(draftKey(context, "reviewLogDifficultyInputKey")));
        insertReviewLog(context, database, record);
        return opId;
    }

    private static void insertReviewLog(Context context, SQLiteDatabase database, JSONObject record) throws Exception {
        String queryName = FolioleCompanionSyncStreamQueryRules.reviewLogQueryName(context);
        FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "insertMutationName"), new Object[] {
            recordString(context, queryName, record, "id", recordString(context, queryName, record, "op_id", "")),
            recordString(context, queryName, record, "op_id", ""),
            recordString(context, queryName, record, "device_id", ""),
            recordString(context, queryName, record, "node_id", ""),
            recordInt(context, queryName, record, "grade"),
            recordString(context, queryName, record, "scheduler_version", ""),
            recordString(context, queryName, record, "reviewed_at", ""),
            recordString(context, queryName, record, "due_before", ""),
            recordDouble(context, queryName, record, "stability_before"),
            recordDouble(context, queryName, record, "difficulty_before"),
            recordString(context, queryName, record, "due_after", ""),
            recordDouble(context, queryName, record, "stability_after"),
            recordDouble(context, queryName, record, "difficulty_after")
        });
    }

    private static String recordString(Context context, String queryName, JSONObject record, String key, String fallback) throws Exception {
        return FolioleCompanionSyncReviewLogRecordRules.string(context, queryName, record, key, fallback);
    }

    private static String recordKey(Context context, String queryName, String key) throws Exception {
        return FolioleCompanionSyncReviewLogRecordRules.key(context, queryName, key);
    }

    private static String draftKey(Context context, String key) throws Exception {
        return FolioleCompanionSyncPayloadQueryStore.metadata(context, FolioleCompanionSyncPayloadQueryStore.nodeReviewPayloadQueryName(), key);
    }

    private static int recordInt(Context context, String queryName, JSONObject record, String key) throws Exception {
        return FolioleCompanionSyncReviewLogRecordRules.intValue(context, queryName, record, key, 0);
    }

    private static double recordDouble(Context context, String queryName, JSONObject record, String key) throws Exception {
        return FolioleCompanionSyncReviewLogRecordRules.doubleValue(context, queryName, record, key, 0);
    }

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionSyncApplyMutationRules.string(context, "reviewLog", key);
    }

}
