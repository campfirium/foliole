package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

final class FolioleCompanionSyncReviewLogStore {

    private FolioleCompanionSyncReviewLogStore() {}

    static JSObject loadReviewLog(Context context, SQLiteDatabase database, JSONObject cursor, int limit, String deviceId) throws Exception {
        return FolioleCompanionNamedQueryStore.loadArray(
            context,
            database,
            "syncReviewLog",
            cursorFilterReplacement(cursor),
            cursorArgs(cursor, deviceId, limit)
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
        FolioleCompanionNamedMutationStore.execute(context, database, "syncReviewLogInsert", new Object[] {
            record.optString("id", record.optString("op_id")),
            record.optString("op_id"),
            record.optString("device_id", ""),
            record.optString("node_id"),
            record.optInt("grade", 0),
            record.optString("scheduler_version", ""),
            record.optString("reviewed_at"),
            record.optString("due_before", ""),
            record.optDouble("stability_before", 0),
            record.optDouble("difficulty_before", 0),
            record.optString("due_after", ""),
            record.optDouble("stability_after", 0),
            record.optDouble("difficulty_after", 0)
        });
    }

    private static String whereAfterCursor(JSONObject cursor) {
        return cursor == null || cursor.optString("created_at").isEmpty() || cursor.optString("change_id").isEmpty()
            ? ""
            : "AND (reviewed_at > ? OR (reviewed_at = ? AND op_id > ?))";
    }

    private static Map<String, String> cursorFilterReplacement(JSONObject cursor) {
        Map<String, String> replacements = new HashMap<>();
        String filter = whereAfterCursor(cursor);
        replacements.put(":cursorFilter", filter.isEmpty() ? "" : " " + filter);
        return replacements;
    }

    private static String[] cursorArgs(JSONObject cursor, String deviceId, int limit) {
        if (cursor == null || cursor.optString("created_at").isEmpty() || cursor.optString("change_id").isEmpty()) {
            return new String[] { deviceId, String.valueOf(normalizeLimit(limit)) };
        }
        return new String[] {
            deviceId,
            cursor.optString("created_at"),
            cursor.optString("created_at"),
            cursor.optString("change_id"),
            String.valueOf(normalizeLimit(limit))
        };
    }

    private static int normalizeLimit(int limit) {
        return Math.max(1, Math.min(1000, limit <= 0 ? 500 : limit));
    }
}
