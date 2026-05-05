package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;

final class FolioleCompanionDirtyNodeExport {

    private FolioleCompanionDirtyNodeExport() {}

    static JSObject loadDirtyNodes(SQLiteDatabase database, String deviceId, String lastSyncedAt) throws JSONException {
        JSObject payload = new JSObject();
        JSONArray nodes = new JSONArray();

        try (Cursor cursor = database.rawQuery(
            "SELECT " +
                "n.id, n.updated_at, n.parent_id, n.kind, n.priority, n.desired_retention, n.title, n.is_title_manual, " +
                "n.hide_title_heading, n.content, n.opening_text, n.virtual_filter, n.reveal, n.anchor_link, " +
                "n.image_regions, n.created_at, n.deleted_at, " +
                "rd.interval_duration_ms, rd.interval_growth_factor, rd.last_handled_at, rd.next_at, rd.priority, " +
                "rd.reading_position, rd.repetition_count, rd.state, " +
                "nr.due, nr.last_review_at, nr.state, nr.stability, nr.difficulty, nr.elapsed_days, " +
                "nr.scheduled_days, nr.reps, nr.lapses " +
            "FROM nodes n " +
            "LEFT JOIN node_reading rd ON rd.node_id = n.id " +
            "LEFT JOIN node_review nr ON nr.node_id = n.id " +
            "WHERE n.sync_dirty = 1 " +
            "ORDER BY n.updated_at ASC, n.id ASC",
            null
        )) {
            while (cursor.moveToNext()) {
                JSObject record = new JSObject();
                record.put("device_id", deviceId);
                record.put("object_id", cursor.getString(0));
                record.put("object_type", "node");
                record.put("updated_at", cursor.getString(1));
                record.put("snapshot", buildSnapshot(cursor));
                nodes.put(record);
            }
        }

        payload.put("device_id", deviceId);
        payload.put("last_synced_at", lastSyncedAt);
        payload.put("nodes", nodes);
        return payload;
    }

    private static JSObject buildSnapshot(Cursor cursor) throws JSONException {
        JSObject snapshot = new JSObject();
        snapshot.put("id", cursor.getString(0));
        snapshot.put("updatedAt", cursor.getString(1));
        snapshot.put("parentNodeId", cursor.isNull(2) ? null : cursor.getString(2));
        snapshot.put("kind", normalizeKind(cursor.isNull(3) ? null : cursor.getString(3)));
        if (!cursor.isNull(4)) {
            snapshot.put("priority", cursor.getInt(4));
        }
        if (!cursor.isNull(5)) {
            snapshot.put("desiredRetention", cursor.getDouble(5));
        }
        snapshot.put("title", normalizeTitle(cursor.isNull(6) ? null : cursor.getString(6)));
        snapshot.put("isTitleManual", cursor.getInt(7) == 1);
        snapshot.put("hideTitleHeading", cursor.getInt(8) == 1);
        snapshot.put("content", cursor.getString(9));
        snapshot.put("openingText", cursor.isNull(10) ? null : cursor.getString(10));
        snapshot.put("virtualFilter", FolioleCompanionJsonValueParser.parse(cursor.isNull(11) ? null : cursor.getString(11)));
        snapshot.put("reveal", cursor.isNull(12) ? null : cursor.getString(12));
        snapshot.put("anchorLink", FolioleCompanionJsonValueParser.parse(cursor.isNull(13) ? null : cursor.getString(13)));
        snapshot.put("imageRegions", FolioleCompanionJsonValueParser.parse(cursor.isNull(14) ? null : cursor.getString(14)));
        snapshot.put("createdAt", cursor.getString(15));
        snapshot.put("deletedAt", cursor.isNull(16) ? null : cursor.getString(16));
        snapshot.put("reading", buildReading(cursor));
        snapshot.put("review", buildReview(cursor));
        return snapshot;
    }

    private static Object buildReading(Cursor cursor) {
        if (cursor.isNull(19) || cursor.isNull(20) || cursor.isNull(24)) {
            return null;
        }
        String state = cursor.getString(24);
        if (!"active".equals(state) && !"done".equals(state) && !"dismissed".equals(state)) {
            return null;
        }
        JSObject reading = new JSObject();
        reading.put("intervalDurationMs", cursor.isNull(17) ? 0 : cursor.getLong(17));
        reading.put("intervalGrowthFactor", cursor.isNull(18) ? 1 : cursor.getDouble(18));
        reading.put("lastHandledAt", cursor.getString(19));
        reading.put("nextAt", cursor.getString(20));
        reading.put("priority", cursor.isNull(21) ? 0 : cursor.getDouble(21));
        reading.put("readingPosition", cursor.isNull(22) ? 0 : cursor.getLong(22));
        reading.put("repetitionCount", cursor.isNull(23) ? 0 : cursor.getLong(23));
        reading.put("state", state);
        return reading;
    }

    private static Object buildReview(Cursor cursor) {
        if (cursor.isNull(25)) {
            return null;
        }
        JSObject review = new JSObject();
        review.put("due", cursor.getString(25));
        review.put("lastReviewAt", cursor.isNull(26) ? null : cursor.getString(26));
        review.put("state", cursor.isNull(27) ? 0 : cursor.getInt(27));
        review.put("stability", cursor.isNull(28) ? 0 : cursor.getDouble(28));
        review.put("difficulty", cursor.isNull(29) ? 0 : cursor.getDouble(29));
        review.put("elapsedDays", cursor.isNull(30) ? 0 : cursor.getInt(30));
        review.put("scheduledDays", cursor.isNull(31) ? 0 : cursor.getInt(31));
        review.put("reps", cursor.isNull(32) ? 0 : cursor.getInt(32));
        review.put("lapses", cursor.isNull(33) ? 0 : cursor.getInt(33));
        return review;
    }

    private static String normalizeKind(String kind) {
        return "item".equals(kind) || "topic".equals(kind) ? kind : "topic";
    }

    private static String normalizeTitle(String title) {
        return title == null || title.trim().isEmpty() ? "Untitled" : title.trim();
    }
}
