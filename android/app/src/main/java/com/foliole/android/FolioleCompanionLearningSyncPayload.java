package com.foliole.android;

import android.content.ContentValues;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

final class FolioleCompanionLearningSyncPayload {

    private FolioleCompanionLearningSyncPayload() {}

    static void applyReading(SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        if (!record.isNull("deleted_at")) {
            database.delete("node_reading", "node_id = ?", new String[] { objectId });
            database.delete("node_reading_device_state", "node_id = ?", new String[] { objectId });
            return;
        }
        JSONObject payload = payload(record);
        ContentValues values = new ContentValues();
        values.put("node_id", objectId);
        values.put("interval_duration_ms", payload.optLong("interval_duration_ms", 0));
        values.put("interval_growth_factor", payload.optDouble("interval_growth_factor", 1));
        values.put("last_handled_at", payload.optString("last_handled_at", record.optString("updated_at")));
        values.put("next_at", payload.optString("next_at", record.optString("updated_at")));
        values.put("priority", payload.optDouble("priority", 0));
        values.put("repetition_count", payload.optInt("repetition_count", 0));
        values.put("state", payload.optString("state", "active"));
        database.insertWithOnConflict("node_reading", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        if (payload.has("reading_position")) {
            ContentValues deviceValues = new ContentValues();
            deviceValues.put("node_id", objectId);
            deviceValues.put("device_id", payload.optString("device_id", "*"));
            deviceValues.put("reading_position", payload.optLong("reading_position", 0));
            deviceValues.put("updated_at", record.optString("updated_at"));
            database.insertWithOnConflict(
                "node_reading_device_state",
                null,
                deviceValues,
                SQLiteDatabase.CONFLICT_REPLACE
            );
        }
    }

    static void applyReview(SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        if (!record.isNull("deleted_at")) {
            database.delete("node_review", "node_id = ?", new String[] { objectId });
            return;
        }
        JSONObject payload = payload(record);
        ContentValues values = new ContentValues();
        values.put("node_id", objectId);
        values.put("due", payload.optString("due", record.optString("updated_at")));
        values.put("last_review_at", nullIfEmpty(payload.optString("last_review_at", "")));
        values.put("state", payload.optInt("state", 0));
        values.put("stability", payload.optDouble("stability", 0));
        values.put("difficulty", payload.optDouble("difficulty", 0));
        values.put("elapsed_days", payload.optInt("elapsed_days", 0));
        values.put("scheduled_days", payload.optInt("scheduled_days", 0));
        values.put("reps", payload.optInt("reps", 0));
        values.put("lapses", payload.optInt("lapses", 0));
        database.insertWithOnConflict("node_review", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static JSONObject payload(JSONObject record) throws Exception {
        return FolioleCompanionSyncPayloadJson.payload(record);
    }

    private static String nullIfEmpty(String value) {
        return value == null || value.trim().isEmpty() ? null : value;
    }
}
