package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncReviewLogApplyHarness {
    private FolioleCompanionSyncReviewLogApplyHarness() {}

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
        if (reviews == null) return appliedOpIds;
        database.beginTransaction();
        try {
            for (int index = 0; index < reviews.length(); index += 1) {
                JSONObject record = reviews.optJSONObject(index);
                if (record == null || record.optString("op_id", "").trim().isEmpty()) continue;
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
}
