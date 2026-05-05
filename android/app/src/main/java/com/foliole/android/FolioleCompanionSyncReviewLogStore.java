package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.UUID;

final class FolioleCompanionSyncReviewLogStore {

    private FolioleCompanionSyncReviewLogStore() {}

    static JSObject loadReviewLog(SQLiteDatabase database, JSONObject cursor, int limit, String deviceId) throws Exception {
        JSArray reviews = new JSArray();
        String sql = "SELECT id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at, " +
            "due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after " +
            "FROM review_log WHERE device_id = ? " + whereAfterCursor(cursor) +
            " ORDER BY reviewed_at ASC, op_id ASC LIMIT ?";
        String[] args = cursor == null
            ? new String[] { deviceId, String.valueOf(normalizeLimit(limit)) }
            : new String[] { deviceId, cursor.optString("created_at"), cursor.optString("created_at"), cursor.optString("change_id"), String.valueOf(normalizeLimit(limit)) };
        try (Cursor row = database.rawQuery(sql, args)) {
            while (row.moveToNext()) {
                JSObject review = new JSObject();
                review.put("id", row.getString(0));
                review.put("op_id", row.getString(1));
                review.put("device_id", row.getString(2));
                review.put("node_id", row.getString(3));
                review.put("grade", row.getInt(4));
                review.put("scheduler_version", row.getString(5));
                review.put("reviewed_at", row.getString(6));
                review.put("due_before", row.getString(7));
                review.put("stability_before", row.getDouble(8));
                review.put("difficulty_before", row.getDouble(9));
                review.put("due_after", row.getString(10));
                review.put("stability_after", row.getDouble(11));
                review.put("difficulty_after", row.getDouble(12));
                reviews.put(review);
            }
        }
        JSObject result = new JSObject();
        result.put("reviews", reviews);
        return result;
    }

    static JSObject applyReviewLog(SQLiteDatabase database, JSONArray reviews) throws Exception {
        JSArray appliedOpIds = applyReviewLogRows(database, reviews, false);
        JSObject result = new JSObject();
        result.put("applied_op_ids", appliedOpIds);
        return result;
    }

    static JSArray applyAndConfirmReviewLogRows(SQLiteDatabase database, JSONArray reviews) throws Exception {
        return applyReviewLogRows(database, reviews, true);
    }

    private static JSArray applyReviewLogRows(SQLiteDatabase database, JSONArray reviews, boolean confirmExisting) throws Exception {
        JSArray appliedOpIds = new JSArray();
        if (reviews == null) {
            return appliedOpIds;
        }
        database.beginTransaction();
        try {
            for (int index = 0; index < reviews.length(); index += 1) {
                JSONObject record = reviews.optJSONObject(index);
                if (record == null || record.optString("op_id", "").trim().isEmpty()) {
                    continue;
                }
                String opId = record.optString("op_id");
                if (nodeExists(database, record.optString("node_id")) &&
                    (insertReviewLog(database, record) || (confirmExisting && reviewLogExists(database, opId)))) {
                    appliedOpIds.put(opId);
                }
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        return appliedOpIds;
    }

    static String saveLocalReviewLog(
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
        insertReviewLog(database, record);
        return opId;
    }

    private static boolean insertReviewLog(SQLiteDatabase database, JSONObject record) {
        ContentValues values = new ContentValues();
        values.put("id", record.optString("id", record.optString("op_id")));
        values.put("op_id", record.optString("op_id"));
        values.put("device_id", record.optString("device_id", ""));
        values.put("node_id", record.optString("node_id"));
        values.put("grade", record.optInt("grade", 0));
        values.put("scheduler_version", record.optString("scheduler_version", ""));
        values.put("reviewed_at", record.optString("reviewed_at"));
        values.put("due_before", record.optString("due_before", ""));
        values.put("stability_before", record.optDouble("stability_before", 0));
        values.put("difficulty_before", record.optDouble("difficulty_before", 0));
        values.put("due_after", record.optString("due_after", ""));
        values.put("stability_after", record.optDouble("stability_after", 0));
        values.put("difficulty_after", record.optDouble("difficulty_after", 0));
        return database.insertWithOnConflict("review_log", null, values, SQLiteDatabase.CONFLICT_IGNORE) != -1;
    }

    private static boolean nodeExists(SQLiteDatabase database, String nodeId) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM nodes WHERE id = ? LIMIT 1",
            new String[] { nodeId == null ? "" : nodeId }
        )) {
            return cursor.moveToFirst();
        }
    }

    private static boolean reviewLogExists(SQLiteDatabase database, String opId) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM review_log WHERE op_id = ? LIMIT 1",
            new String[] { opId == null ? "" : opId }
        )) {
            return cursor.moveToFirst();
        }
    }

    private static String whereAfterCursor(JSONObject cursor) {
        return cursor == null || cursor.optString("created_at").isEmpty() || cursor.optString("change_id").isEmpty()
            ? ""
            : "AND (reviewed_at > ? OR (reviewed_at = ? AND op_id > ?))";
    }

    private static int normalizeLimit(int limit) {
        return Math.max(1, Math.min(1000, limit <= 0 ? 500 : limit));
    }
}
