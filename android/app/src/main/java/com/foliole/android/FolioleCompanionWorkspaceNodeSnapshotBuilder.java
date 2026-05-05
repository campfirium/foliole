package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;

final class FolioleCompanionWorkspaceNodeSnapshotBuilder {
    private FolioleCompanionWorkspaceNodeSnapshotBuilder() {}

    static JSObject build(Context context, SQLiteDatabase database, Cursor cursor, String deletedAt) throws Exception {
        JSObject node = new JSObject();
        node.put("id", cursor.getString(0));
        node.put("parentNodeId", cursor.isNull(1) ? null : cursor.getString(1));
        node.put("kind", normalizeKind(cursor.isNull(2) ? null : cursor.getString(2)));
        if (!cursor.isNull(3)) node.put("priority", cursor.getInt(3));
        if (!cursor.isNull(4)) node.put("desiredRetention", cursor.getDouble(4));
        node.put("title", normalizeTitle(cursor.isNull(5) ? null : cursor.getString(5)));
        node.put("isTitleManual", cursor.getInt(6) == 1);
        node.put("hideTitleHeading", cursor.getInt(7) == 1);
        node.put("content", cursor.getString(8));
        node.put("bodyBlobHash", cursor.isNull(36) ? null : cursor.getString(36));
        putBodyStatus(node, cursor.getString(10));
        JSONArray attachments = FolioleCompanionNodeAttachmentStore.loadNodeAttachments(context, database, cursor.getString(0));
        if (attachments.length() > 0) node.put("attachments", attachments);
        node.put("openingText", cursor.isNull(9) ? null : cursor.getString(9));
        node.put("virtualFilter", FolioleCompanionJsonValueParser.parse(cursor.isNull(11) ? null : cursor.getString(11)));
        node.put("reveal", cursor.isNull(12) ? null : cursor.getString(12));
        node.put("anchorLink", FolioleCompanionJsonValueParser.parse(cursor.isNull(13) ? null : cursor.getString(13)));
        node.put("imageRegions", FolioleCompanionJsonValueParser.parse(cursor.isNull(14) ? null : cursor.getString(14)));
        node.put("reading", buildReading(cursor));
        node.put("review", buildReview(cursor));
        node.put("createdAt", cursor.getString(15));
        node.put("updatedAt", cursor.getString(16));
        node.put("currentVersionId", cursor.isNull(18) ? null : cursor.getString(18));
        if (deletedAt != null) node.put("deletedAt", deletedAt);
        return node;
    }

    private static void putBodyStatus(JSObject node, String bodyStatus) throws JSONException {
        if ("missing".equals(bodyStatus) || "empty".equals(bodyStatus) || "fetching".equals(bodyStatus) || "failed".equals(bodyStatus)) {
            node.put("bodyStatus", bodyStatus);
        }
    }

    private static Object buildReading(Cursor cursor) {
        if (cursor.isNull(21) || cursor.isNull(22) || cursor.isNull(26)) return null;
        String state = cursor.getString(26);
        if (!"active".equals(state) && !"done".equals(state) && !"dismissed".equals(state)) return null;
        JSObject reading = new JSObject();
        reading.put("intervalDurationMs", cursor.isNull(19) ? 0 : cursor.getLong(19));
        reading.put("intervalGrowthFactor", cursor.isNull(20) ? 1 : cursor.getDouble(20));
        reading.put("lastHandledAt", cursor.getString(21));
        reading.put("nextAt", cursor.getString(22));
        reading.put("priority", cursor.isNull(23) ? 0 : cursor.getDouble(23));
        reading.put("readingPosition", cursor.isNull(24) ? 0 : cursor.getLong(24));
        reading.put("repetitionCount", cursor.isNull(25) ? 0 : cursor.getLong(25));
        reading.put("state", state);
        return reading;
    }

    private static Object buildReview(Cursor cursor) {
        if (cursor.isNull(27)) return null;
        JSObject review = new JSObject();
        review.put("due", cursor.getString(27));
        review.put("lastReviewAt", cursor.isNull(28) ? null : cursor.getString(28));
        review.put("state", cursor.isNull(29) ? 0 : cursor.getInt(29));
        review.put("stability", cursor.isNull(30) ? 0 : cursor.getDouble(30));
        review.put("difficulty", cursor.isNull(31) ? 0 : cursor.getDouble(31));
        review.put("elapsedDays", cursor.isNull(32) ? 0 : cursor.getInt(32));
        review.put("scheduledDays", cursor.isNull(33) ? 0 : cursor.getInt(33));
        review.put("reps", cursor.isNull(34) ? 0 : cursor.getInt(34));
        review.put("lapses", cursor.isNull(35) ? 0 : cursor.getInt(35));
        return review;
    }

    private static String normalizeKind(String kind) {
        return "folder".equals(kind) || "item".equals(kind) || "topic".equals(kind) ? kind : "topic";
    }

    private static String normalizeTitle(String title) {
        return title == null || title.trim().isEmpty() ? "Untitled" : title.trim();
    }
}
