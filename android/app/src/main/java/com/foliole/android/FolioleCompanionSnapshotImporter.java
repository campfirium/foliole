package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

final class FolioleCompanionSnapshotImporter {

    private static final String ACTIVE_NODE_META_KEY = "active_node_id";

    private FolioleCompanionSnapshotImporter() {}

    static void replaceWorkspaceSnapshot(SQLiteDatabase database, String workspaceSnapshotJson, String syncedAt) throws Exception {
        database.beginTransaction();
        try {
            clearWorkspaceTables(database);

            JSONObject snapshot = parseSnapshot(workspaceSnapshotJson);
            if (snapshot != null) {
                importNodes(database, snapshot, syncedAt);
                importNodeOrder(database, snapshot);
                importActiveNode(database, snapshot, syncedAt);
            }

            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    private static JSONObject parseSnapshot(String workspaceSnapshotJson) throws Exception {
        if (workspaceSnapshotJson == null) {
            return null;
        }
        String normalized = workspaceSnapshotJson.trim();
        if (normalized.isEmpty() || "null".equals(normalized)) {
            return null;
        }
        return new JSONObject(normalized);
    }

    private static void clearWorkspaceTables(SQLiteDatabase database) {
        database.delete("node_review", null, null);
        database.delete("node_reading", null, null);
        database.delete("node_order", null, null);
        database.delete("workspace_meta", "key = ?", new String[] { ACTIVE_NODE_META_KEY });
        database.delete("nodes", null, null);
    }

    private static void importNodes(SQLiteDatabase database, JSONObject snapshot, String syncedAt) {
        JSONObject nodesById = snapshot.optJSONObject("nodesById");
        if (nodesById == null) {
            return;
        }
        Set<String> trashedNodeIds = readStringSet(snapshot.optJSONArray("trashedNodeIds"));
        JSONArray nodeOrder = snapshot.optJSONArray("nodeOrder");
        Set<String> insertedNodeIds = new HashSet<>();

        if (nodeOrder != null) {
            for (int index = 0; index < nodeOrder.length(); index += 1) {
                String nodeId = nodeOrder.optString(index, null);
                if (nodeId == null || trashedNodeIds.contains(nodeId)) {
                    continue;
                }
                JSONObject node = nodesById.optJSONObject(nodeId);
                if (node == null) {
                    continue;
                }
                upsertNode(database, nodeId, node, syncedAt);
                upsertReading(database, nodeId, node.optJSONObject("reading"));
                upsertReview(database, nodeId, node.optJSONObject("review"));
                insertedNodeIds.add(nodeId);
            }
        }

        Iterator<String> keys = nodesById.keys();
        while (keys.hasNext()) {
            String nodeId = keys.next();
            if (insertedNodeIds.contains(nodeId) || trashedNodeIds.contains(nodeId)) {
                continue;
            }
            JSONObject node = nodesById.optJSONObject(nodeId);
            if (node == null) {
                continue;
            }
            upsertNode(database, nodeId, node, syncedAt);
            upsertReading(database, nodeId, node.optJSONObject("reading"));
            upsertReview(database, nodeId, node.optJSONObject("review"));
        }
    }

    private static void importNodeOrder(SQLiteDatabase database, JSONObject snapshot) {
        JSONArray nodeOrder = snapshot.optJSONArray("nodeOrder");
        if (nodeOrder == null) {
            return;
        }
        int position = 0;
        for (int index = 0; index < nodeOrder.length(); index += 1) {
            String nodeId = nodeOrder.optString(index, null);
            if (nodeId == null || !nodeExists(database, nodeId)) {
                continue;
            }
            ContentValues values = new ContentValues();
            values.put("node_id", nodeId);
            values.put("position", position);
            database.insertWithOnConflict("node_order", null, values, SQLiteDatabase.CONFLICT_REPLACE);
            position += 1;
        }
    }

    private static void importActiveNode(SQLiteDatabase database, JSONObject snapshot, String syncedAt) {
        String activeNodeId = snapshot.optString("activeNodeId", null);
        if (activeNodeId == null || activeNodeId.trim().isEmpty() || !nodeExists(database, activeNodeId)) {
            return;
        }
        ContentValues values = new ContentValues();
        values.put("key", ACTIVE_NODE_META_KEY);
        values.put("value", activeNodeId);
        values.put("updated_at", syncedAt);
        database.insertWithOnConflict("workspace_meta", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void upsertNode(SQLiteDatabase database, String nodeId, JSONObject node, String syncedAt) {
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
        values.putNull("deleted_at");
        database.insertWithOnConflict("nodes", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static void upsertReading(SQLiteDatabase database, String nodeId, JSONObject reading) {
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

    private static void upsertReview(SQLiteDatabase database, String nodeId, JSONObject review) {
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

    private static Set<String> readStringSet(JSONArray values) {
        Set<String> result = new HashSet<>();
        if (values == null) {
            return result;
        }
        for (int index = 0; index < values.length(); index += 1) {
            String value = values.optString(index, null);
            if (value != null && !value.trim().isEmpty()) {
                result.add(value);
            }
        }
        return result;
    }

    private static boolean nodeExists(SQLiteDatabase database, String nodeId) {
        try (Cursor cursor = database.rawQuery("SELECT COUNT(*) FROM nodes WHERE id = ?", new String[] { nodeId })) {
            return cursor.moveToFirst() && cursor.getLong(0) > 0;
        }
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
