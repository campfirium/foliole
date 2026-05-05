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
        JSONObject cardBefore = draft.getJSONObject("cardBefore");
        JSONObject cardAfter = draft.getJSONObject("cardAfter");
        JSONObject record = new JSONObject();
        record.put("id", UUID.randomUUID().toString());
        record.put("op_id", opId);
        record.put("device_id", deviceId);
        record.put("node_id", nodeId);
        record.put("grade", draft.getInt("grade"));
        record.put("scheduler_version", draft.optString("schedulerVersion", ""));
        record.put("reviewed_at", draft.getString("reviewedAt"));
        record.put("due_before", cardBefore.getString("due"));
        record.put("stability_before", cardBefore.getDouble("stability"));
        record.put("difficulty_before", cardBefore.getDouble("difficulty"));
        record.put("due_after", cardAfter.getString("due"));
        record.put("stability_after", cardAfter.getDouble("stability"));
        record.put("difficulty_after", cardAfter.getDouble("difficulty"));
        insertReviewLog(context, database, record);
        return opId;
    }

    private static void insertReviewLog(Context context, SQLiteDatabase database, JSONObject record) throws Exception {
        String queryName = FolioleCompanionSyncStreamQueryRules.reviewLogQueryName(context);
        FolioleCompanionNamedMutationStore.execute(context, database, mutationRule(context, "insertMutationName"), new Object[] {
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
