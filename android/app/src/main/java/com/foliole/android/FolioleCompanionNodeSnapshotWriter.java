package com.foliole.android;

import android.content.ContentValues;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

final class FolioleCompanionNodeSnapshotWriter {

    private FolioleCompanionNodeSnapshotWriter() {}

    static void upsertNodeSnapshot(SQLiteDatabase database, String nodeId, JSONObject node, String syncedAt) {
        upsertNodeSnapshot(database, nodeId, node, syncedAt, false, null);
    }

    static void upsertNodeSnapshot(
        SQLiteDatabase database,
        String nodeId,
        JSONObject node,
        String syncedAt,
        boolean syncDirty,
        String deviceId
    ) {
        upsertNode(database, nodeId, node, syncedAt, syncDirty, deviceId);
        replaceReading(database, nodeId, node.optJSONObject("reading"));
        replaceReview(database, nodeId, node.optJSONObject("review"));
    }

    private static void upsertNode(
        SQLiteDatabase database,
        String nodeId,
        JSONObject node,
        String syncedAt,
        boolean syncDirty,
        String deviceId
    ) {
        ContentValues values = new ContentValues();
        values.put("id", nodeId);
        putNullableString(values, "parent_id", trimToNull(node.optString("parentNodeId", null)));
        values.put("kind", trimToNull(node.optString("kind", "topic")));
        putNullableInteger(values, "priority", node.opt("priority"));
        putNullableDouble(values, "desired_retention", node.opt("desiredRetention"));
        values.put("title", trimToNull(node.optString("title", "")) == null ? "Untitled" : node.optString("title", "").trim());
        values.put("is_title_manual", node.optBoolean("isTitleManual", false) ? 1 : 0);
        values.put("hide_title_heading", node.optBoolean("hideTitleHeading", false) ? 1 : 0);
        values.put("content", node.optString("content", ""));
        putNullableString(values, "opening_text", trimToNull(node.optString("openingText", null)));
        putJsonValue(values, "virtual_filter", node.opt("virtualFilter"));
        putNullableString(values, "reveal", trimToNull(node.optString("reveal", null)));
        putJsonValue(values, "anchor_link", node.opt("anchorLink"));
        putJsonValue(values, "image_regions", node.opt("imageRegions"));
        putNullableString(values, "created_at", trimToNull(node.optString("createdAt", syncedAt)));
        putNullableString(values, "updated_at", trimToNull(node.optString("updatedAt", syncedAt)));
        values.put("last_modified_by_device_id", syncDirty ? trimToNull(deviceId) : null);
        values.put("sync_dirty", syncDirty ? 1 : 0);
        values.putNull("deleted_at");
        database.insertWithOnConflict("nodes", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void replaceReading(SQLiteDatabase database, String nodeId, JSONObject reading) {
        database.delete("node_reading", "node_id = ?", new String[] { nodeId });
        if (reading == null) {
            return;
        }
        ContentValues values = new ContentValues();
        values.put("node_id", nodeId);
        values.put("interval_duration_ms", readLong(reading.opt("intervalDurationMs"), 0));
        values.put("interval_growth_factor", readDouble(reading.opt("intervalGrowthFactor"), 1));
        values.put("last_handled_at", reading.optString("lastHandledAt", ""));
        values.put("next_at", reading.optString("nextAt", ""));
        values.put("priority", readDouble(reading.opt("priority"), 0));
        values.put("reading_position", readLong(reading.opt("readingPosition"), 0));
        values.put("repetition_count", readLong(reading.opt("repetitionCount"), 0));
        values.put("state", trimToNull(reading.optString("state", "active")));
        database.insertWithOnConflict("node_reading", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void replaceReview(SQLiteDatabase database, String nodeId, JSONObject review) {
        database.delete("node_review", "node_id = ?", new String[] { nodeId });
        if (review == null) {
            return;
        }
        ContentValues values = new ContentValues();
        values.put("node_id", nodeId);
        values.put("due", review.optString("due", ""));
        putNullableString(values, "last_review_at", trimToNull(review.optString("lastReviewAt", null)));
        values.put("state", readLong(review.opt("state"), 0));
        values.put("stability", readDouble(review.opt("stability"), 0));
        values.put("difficulty", readDouble(review.opt("difficulty"), 0));
        values.put("elapsed_days", readLong(review.opt("elapsedDays"), 0));
        values.put("scheduled_days", readLong(review.opt("scheduledDays"), 0));
        values.put("reps", readLong(review.opt("reps"), 0));
        values.put("lapses", readLong(review.opt("lapses"), 0));
        database.insertWithOnConflict("node_review", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void putJsonValue(ContentValues values, String key, Object rawValue) {
        if (rawValue == null || rawValue == JSONObject.NULL) {
            values.putNull(key);
            return;
        }
        values.put(key, rawValue.toString());
    }

    private static void putNullableString(ContentValues values, String key, String value) {
        if (value == null) {
            values.putNull(key);
            return;
        }
        values.put(key, value);
    }

    private static void putNullableInteger(ContentValues values, String key, Object rawValue) {
        if (rawValue instanceof Number) {
            values.put(key, ((Number) rawValue).intValue());
            return;
        }
        values.putNull(key);
    }

    private static void putNullableDouble(ContentValues values, String key, Object rawValue) {
        if (rawValue instanceof Number) {
            values.put(key, ((Number) rawValue).doubleValue());
            return;
        }
        values.putNull(key);
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static long readLong(Object value, long fallback) {
        return value instanceof Number ? ((Number) value).longValue() : fallback;
    }

    private static double readDouble(Object value, double fallback) {
        return value instanceof Number ? ((Number) value).doubleValue() : fallback;
    }
}
