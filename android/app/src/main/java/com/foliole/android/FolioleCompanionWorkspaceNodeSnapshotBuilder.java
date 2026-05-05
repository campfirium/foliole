package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class FolioleCompanionWorkspaceNodeSnapshotBuilder {
    private FolioleCompanionWorkspaceNodeSnapshotBuilder() {}

    static JSObject build(Context context, SQLiteDatabase database, JSONObject row, String deletedAt) throws Exception {
        JSObject node = new JSObject();
        String nodeId = row.getString("id");
        node.put("id", nodeId);
        node.put("parentNodeId", nullableString(row, "parent_id"));
        node.put("kind", normalizeKind(nullableString(row, "kind")));
        if (!row.isNull("priority")) node.put("priority", row.getLong("priority"));
        if (!row.isNull("desired_retention")) node.put("desiredRetention", row.getDouble("desired_retention"));
        node.put("title", normalizeTitle(nullableString(row, "title")));
        node.put("isTitleManual", row.getLong("is_title_manual") == 1);
        node.put("hideTitleHeading", row.getLong("hide_title_heading") == 1);
        node.put("content", nullableString(row, "content"));
        node.put("bodyBlobHash", nullableString(row, "body_blob_hash"));
        putBodyStatus(node, row.getString("body_status"));
        JSONArray attachments = FolioleCompanionNodeAttachmentStore.loadNodeAttachments(context, database, nodeId);
        if (attachments.length() > 0) node.put("attachments", attachments);
        node.put("openingText", nullableString(row, "opening_text"));
        node.put("virtualFilter", FolioleCompanionJsonValueParser.parse(nullableString(row, "virtual_filter")));
        node.put("reveal", nullableString(row, "reveal"));
        node.put("anchorLink", FolioleCompanionJsonValueParser.parse(nullableString(row, "anchor_link")));
        node.put("imageRegions", FolioleCompanionJsonValueParser.parse(nullableString(row, "image_regions")));
        node.put("reading", buildReading(row));
        node.put("review", buildReview(row));
        node.put("createdAt", row.getString("created_at"));
        node.put("updatedAt", row.getString("updated_at"));
        node.put("currentVersionId", nullableString(row, "current_version_id"));
        if (deletedAt != null) node.put("deletedAt", deletedAt);
        return node;
    }

    private static void putBodyStatus(JSObject node, String bodyStatus) throws JSONException {
        if ("missing".equals(bodyStatus) || "empty".equals(bodyStatus) || "fetching".equals(bodyStatus) || "failed".equals(bodyStatus)) {
            node.put("bodyStatus", bodyStatus);
        }
    }

    private static Object buildReading(JSONObject row) {
        if (row.isNull("last_handled_at") || row.isNull("next_at") || row.isNull("reading_state")) return null;
        String state = row.optString("reading_state", null);
        if (!"active".equals(state) && !"done".equals(state) && !"dismissed".equals(state)) return null;
        JSObject reading = new JSObject();
        reading.put("intervalDurationMs", row.isNull("interval_duration_ms") ? 0 : row.optLong("interval_duration_ms", 0));
        reading.put("intervalGrowthFactor", row.isNull("interval_growth_factor") ? 1 : row.optDouble("interval_growth_factor", 1));
        reading.put("lastHandledAt", row.optString("last_handled_at", null));
        reading.put("nextAt", row.optString("next_at", null));
        reading.put("priority", row.isNull("reading_priority") ? 0 : row.optDouble("reading_priority", 0));
        reading.put("readingPosition", row.isNull("reading_position") ? 0 : row.optLong("reading_position", 0));
        reading.put("repetitionCount", row.isNull("repetition_count") ? 0 : row.optLong("repetition_count", 0));
        reading.put("state", state);
        return reading;
    }

    private static Object buildReview(JSONObject row) {
        if (row.isNull("due")) return null;
        JSObject review = new JSObject();
        review.put("due", row.optString("due", null));
        review.put("lastReviewAt", nullableString(row, "last_review_at"));
        review.put("state", row.isNull("review_state") ? 0 : row.optLong("review_state", 0));
        review.put("stability", row.isNull("stability") ? 0 : row.optDouble("stability", 0));
        review.put("difficulty", row.isNull("difficulty") ? 0 : row.optDouble("difficulty", 0));
        review.put("elapsedDays", row.isNull("elapsed_days") ? 0 : row.optLong("elapsed_days", 0));
        review.put("scheduledDays", row.isNull("scheduled_days") ? 0 : row.optLong("scheduled_days", 0));
        review.put("reps", row.isNull("reps") ? 0 : row.optLong("reps", 0));
        review.put("lapses", row.isNull("lapses") ? 0 : row.optLong("lapses", 0));
        return review;
    }

    private static String nullableString(JSONObject row, String key) {
        return row.isNull(key) ? null : row.optString(key, null);
    }

    private static String normalizeKind(String kind) {
        return "folder".equals(kind) || "item".equals(kind) || "topic".equals(kind) ? kind : "topic";
    }

    private static String normalizeTitle(String title) {
        return title == null || title.trim().isEmpty() ? "Untitled" : title.trim();
    }
}
