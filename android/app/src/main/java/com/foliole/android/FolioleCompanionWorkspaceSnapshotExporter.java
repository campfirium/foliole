package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class FolioleCompanionWorkspaceSnapshotExporter {

    private static final String ACTIVE_NODE_META_KEY = "active_node_id";
    private static final String UNTITLED_SEQUENCE_META_KEY = "untitled_sequence_by_parent";

    private FolioleCompanionWorkspaceSnapshotExporter() {}

    static JSObject loadWorkspaceSnapshot(SQLiteDatabase database, String deviceId) throws JSONException {
        JSONArray orderedNodeIds = loadOrderedNodeIds(database);
        if (orderedNodeIds.length() == 0) {
            return null;
        }
        boolean canReadBodyBlobData = hasTable(database, "content_blob_data");
        String contentExpression = canReadBodyBlobData ? "COALESCE(CAST(cbd.data AS TEXT), n.content)" : "n.content";
        String contentBlobJoin = canReadBodyBlobData
            ? "LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash "
            : "";
        String bodyStatusExpression = canReadBodyBlobData
            ? "CASE WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL AND cb.availability IN ('fetching', 'failed') THEN cb.availability " +
                "WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL THEN 'missing' " +
                "WHEN TRIM(COALESCE(CAST(cbd.data AS TEXT), n.content)) = '' THEN 'empty' ELSE 'ready' END"
            : "CASE WHEN TRIM(COALESCE(n.content, '')) = '' THEN 'empty' ELSE 'ready' END";

        JSObject nodesById = new JSObject();
        JSONArray trashedNodeIds = new JSONArray();
        String firstActiveNodeId = null;

        try (Cursor cursor = database.rawQuery(
            "SELECT " +
                "n.id, n.parent_id, n.kind, n.priority, n.desired_retention, n.title, n.is_title_manual, " +
                "n.hide_title_heading, " + contentExpression + ", n.opening_text, " + bodyStatusExpression + ", " +
                "n.virtual_filter, n.reveal, n.anchor_link, " +
                "n.image_regions, n.created_at, n.updated_at, n.deleted_at, n.current_version_id, " +
                "rd.interval_duration_ms, rd.interval_growth_factor, rd.last_handled_at, rd.next_at, rd.priority, " +
                "rds.reading_position, rd.repetition_count, rd.state, " +
                "nr.due, nr.last_review_at, nr.state, nr.stability, nr.difficulty, nr.elapsed_days, " +
                "nr.scheduled_days, nr.reps, nr.lapses, n.body_blob_hash " +
            "FROM nodes n " +
            contentBlobJoin +
            "LEFT JOIN node_reading rd ON rd.node_id = n.id " +
            "LEFT JOIN node_reading_device_state rds ON rds.node_id = n.id AND rds.device_id = ? " +
            "LEFT JOIN node_review nr ON nr.node_id = n.id " +
            "ORDER BY CASE WHEN EXISTS (SELECT 1 FROM node_order no WHERE no.node_id = n.id) THEN 0 ELSE 1 END, " +
                "(SELECT no.position FROM node_order no WHERE no.node_id = n.id), n.created_at ASC",
            new String[] { deviceId }
        )) {
            while (cursor.moveToNext()) {
                String nodeId = cursor.getString(0);
                String deletedAt = cursor.isNull(17) ? null : cursor.getString(17);
                if (deletedAt != null) {
                    trashedNodeIds.put(nodeId);
                } else if (firstActiveNodeId == null) {
                    firstActiveNodeId = nodeId;
                }
                nodesById.put(nodeId, buildNode(database, cursor, deletedAt));
            }
        }

        if (nodesById.length() == 0) {
            return null;
        }

        JSObject snapshot = new JSObject();
        snapshot.put("activeNodeId", resolveActiveNodeId(database, nodesById, trashedNodeIds, firstActiveNodeId));
        snapshot.put("nodeOrder", orderedNodeIds);
        snapshot.put("nodesById", nodesById);
        snapshot.put("persistedNodeViewById", FolioleCompanionWorkspaceViewStateExporter.loadPersistedNodeViewById(database, deviceId));
        snapshot.put("trashedNodeIds", trashedNodeIds);
        snapshot.put("untitledSequenceByParent", loadUntitledSequenceByParent(database));
        return snapshot;
    }

    private static boolean hasTable(SQLiteDatabase database, String tableName) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            new String[] { tableName }
        )) {
            return cursor.moveToFirst();
        }
    }

    private static JSONArray loadOrderedNodeIds(SQLiteDatabase database) {
        JSONArray result = new JSONArray();
        try (Cursor cursor = database.rawQuery(
            "SELECT n.id " +
            "FROM nodes n " +
            "LEFT JOIN node_order no ON no.node_id = n.id " +
            "ORDER BY CASE WHEN no.position IS NULL THEN 1 ELSE 0 END, no.position ASC, n.created_at ASC",
            null
        )) {
            while (cursor.moveToNext()) {
                result.put(cursor.getString(0));
            }
        }
        return result;
    }

    private static JSObject buildNode(SQLiteDatabase database, Cursor cursor, String deletedAt) throws JSONException {
        JSObject node = new JSObject();
        node.put("id", cursor.getString(0));
        node.put("parentNodeId", cursor.isNull(1) ? null : cursor.getString(1));
        node.put("kind", normalizeKind(cursor.isNull(2) ? null : cursor.getString(2)));
        if (!cursor.isNull(3)) {
            node.put("priority", cursor.getInt(3));
        }
        if (!cursor.isNull(4)) {
            node.put("desiredRetention", cursor.getDouble(4));
        }
        node.put("title", normalizeTitle(cursor.isNull(5) ? null : cursor.getString(5)));
        node.put("isTitleManual", cursor.getInt(6) == 1);
        node.put("hideTitleHeading", cursor.getInt(7) == 1);
        node.put("content", cursor.getString(8));
        node.put("bodyBlobHash", cursor.isNull(36) ? null : cursor.getString(36));
        String bodyStatus = cursor.getString(10);
        if ("missing".equals(bodyStatus) || "empty".equals(bodyStatus) || "fetching".equals(bodyStatus) || "failed".equals(bodyStatus)) {
            node.put("bodyStatus", bodyStatus);
        }
        JSArray attachments = FolioleCompanionNodeAttachmentStore.loadNodeAttachments(database, cursor.getString(0));
        if (attachments.length() > 0) {
            node.put("attachments", attachments);
        }
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
        if (deletedAt != null) {
            node.put("deletedAt", deletedAt);
        }
        return node;
    }

    private static Object buildReading(Cursor cursor) {
        if (cursor.isNull(21) || cursor.isNull(22) || cursor.isNull(26)) {
            return null;
        }
        String state = cursor.getString(26);
        if (!"active".equals(state) && !"done".equals(state) && !"dismissed".equals(state)) {
            return null;
        }
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
        if (cursor.isNull(27)) {
            return null;
        }
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

    private static String resolveActiveNodeId(
        SQLiteDatabase database,
        JSObject nodesById,
        JSONArray trashedNodeIds,
        String fallbackActiveNodeId
    ) {
        String persistedActiveNodeId = loadWorkspaceMetaValue(database, ACTIVE_NODE_META_KEY);
        if (persistedActiveNodeId != null && nodesById.has(persistedActiveNodeId) && !contains(trashedNodeIds, persistedActiveNodeId)) {
            return persistedActiveNodeId;
        }
        return fallbackActiveNodeId;
    }

    private static JSObject loadUntitledSequenceByParent(SQLiteDatabase database) throws JSONException {
        String rawValue = loadWorkspaceMetaValue(database, UNTITLED_SEQUENCE_META_KEY);
        if (rawValue == null || rawValue.trim().isEmpty()) {
            return new JSObject();
        }
        Object parsed = FolioleCompanionJsonValueParser.parse(rawValue);
        return parsed instanceof JSONObject ? new JSObject(rawValue) : new JSObject();
    }

    private static String loadWorkspaceMetaValue(SQLiteDatabase database, String key) {
        try (Cursor cursor = database.query(
            "workspace_meta",
            new String[] { "value" },
            "key = ?",
            new String[] { key },
            null,
            null,
            null,
            "1"
        )) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            String value = cursor.getString(0);
            return value == null || value.trim().isEmpty() ? null : value;
        }
    }

    private static boolean contains(JSONArray values, String target) {
        for (int index = 0; index < values.length(); index += 1) {
            if (target.equals(values.optString(index, null))) {
                return true;
            }
        }
        return false;
    }

    private static String normalizeKind(String kind) {
        return "folder".equals(kind) || "item".equals(kind) || "topic".equals(kind) ? kind : "topic";
    }

    private static String normalizeTitle(String title) {
        return title == null || title.trim().isEmpty() ? "Untitled" : title.trim();
    }
}
