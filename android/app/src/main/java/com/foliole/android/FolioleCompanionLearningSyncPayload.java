package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

final class FolioleCompanionLearningSyncPayload {

    private FolioleCompanionLearningSyncPayload() {}

    static void applyReading(Context context, SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        if (!record.isNull("deleted_at")) {
            FolioleCompanionNamedMutationStore.execute(context, database, "syncNodeReadingDelete", new Object[] { objectId });
            FolioleCompanionNamedMutationStore.execute(context, database, "syncNodeReadingDeviceStateDelete", new Object[] { objectId });
            return;
        }
        JSONObject payload = payload(record);
        FolioleCompanionNamedMutationStore.execute(context, database, "syncNodeReadingUpsert", new Object[] {
            objectId,
            payload.optLong("interval_duration_ms", 0),
            payload.optDouble("interval_growth_factor", 1),
            payload.optString("last_handled_at", record.optString("updated_at")),
            payload.optString("next_at", record.optString("updated_at")),
            payload.optDouble("priority", 0),
            payload.optInt("repetition_count", 0),
            payload.optString("state", "active")
        });
        if (payload.has("reading_position")) {
            FolioleCompanionNamedMutationStore.execute(context, database, "syncNodeReadingDeviceStateUpsert", new Object[] {
                objectId,
                payload.optString("device_id", "*"),
                payload.optLong("reading_position", 0),
                record.optString("updated_at")
            });
        }
    }

    static void applyReview(Context context, SQLiteDatabase database, String objectId, JSONObject record) throws Exception {
        if (!record.isNull("deleted_at")) {
            FolioleCompanionNamedMutationStore.execute(context, database, "syncNodeReviewDelete", new Object[] { objectId });
            return;
        }
        JSONObject payload = payload(record);
        FolioleCompanionNamedMutationStore.execute(context, database, "syncNodeReviewUpsert", new Object[] {
            objectId,
            payload.optString("due", record.optString("updated_at")),
            nullIfEmpty(payload.optString("last_review_at", "")),
            payload.optInt("state", 0),
            payload.optDouble("stability", 0),
            payload.optDouble("difficulty", 0),
            payload.optInt("elapsed_days", 0),
            payload.optInt("scheduled_days", 0),
            payload.optInt("reps", 0),
            payload.optInt("lapses", 0)
        });
    }

    private static JSONObject payload(JSONObject record) throws Exception {
        return FolioleCompanionSyncPayloadJson.payload(record);
    }

    private static String nullIfEmpty(String value) {
        return value == null || value.trim().isEmpty() ? null : value;
    }
}
