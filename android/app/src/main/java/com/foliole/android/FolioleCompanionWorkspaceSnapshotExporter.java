package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

final class FolioleCompanionWorkspaceSnapshotExporter {

    private static final String ACTIVE_NODE_META_KEY = "active_node_id";
    private static final String UNTITLED_SEQUENCE_META_KEY = "untitled_sequence_by_parent";

    private FolioleCompanionWorkspaceSnapshotExporter() {}

    static JSObject loadWorkspaceSnapshot(Context context, SQLiteDatabase database, String deviceId) throws Exception {
        JSONArray orderedNodeIds = loadOrderedNodeIds(context, database);
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

        JSONArray nodes = FolioleCompanionNamedQueryStore
            .loadArray(context, database, "workspaceSnapshotNodes", snapshotQueryReplacements(contentExpression, contentBlobJoin, bodyStatusExpression), new String[] { deviceId })
            .getJSONArray("nodes");
        for (int index = 0; index < nodes.length(); index += 1) {
            JSONObject row = nodes.getJSONObject(index);
            String nodeId = row.getString("id");
            String deletedAt = row.isNull("deleted_at") ? null : row.getString("deleted_at");
            if (deletedAt != null) {
                trashedNodeIds.put(nodeId);
            } else if (firstActiveNodeId == null) {
                firstActiveNodeId = nodeId;
            }
            nodesById.put(nodeId, FolioleCompanionWorkspaceNodeSnapshotBuilder.build(context, database, row, deletedAt));
        }

        if (nodesById.length() == 0) {
            return null;
        }

        JSObject snapshot = new JSObject();
        snapshot.put("activeNodeId", resolveActiveNodeId(context, database, nodesById, trashedNodeIds, firstActiveNodeId));
        snapshot.put("nodeOrder", orderedNodeIds);
        snapshot.put("nodesById", nodesById);
        snapshot.put("persistedNodeViewById", FolioleCompanionWorkspaceViewStateExporter.loadPersistedNodeViewById(context, database, deviceId));
        snapshot.put("trashedNodeIds", trashedNodeIds);
        snapshot.put("untitledSequenceByParent", loadUntitledSequenceByParent(context, database));
        return snapshot;
    }

    private static Map<String, String> snapshotQueryReplacements(
        String contentExpression,
        String contentBlobJoin,
        String bodyStatusExpression
    ) {
        Map<String, String> replacements = new HashMap<>();
        replacements.put("__CONTENT_EXPRESSION__", contentExpression);
        replacements.put("__CONTENT_BLOB_JOIN__", contentBlobJoin);
        replacements.put("__BODY_STATUS_EXPRESSION__", bodyStatusExpression);
        return replacements;
    }

    private static boolean hasTable(SQLiteDatabase database, String tableName) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            new String[] { tableName }
        )) {
            return cursor.moveToFirst();
        }
    }

    private static JSONArray loadOrderedNodeIds(Context context, SQLiteDatabase database) throws Exception {
        JSONArray result = new JSONArray();
        JSONArray rows = FolioleCompanionNamedQueryStore.loadArray(context, database, "workspaceOrderedNodeIds").getJSONArray("nodes");
        for (int index = 0; index < rows.length(); index += 1) {
            result.put(rows.getJSONObject(index).getString("id"));
        }
        return result;
    }

    private static String resolveActiveNodeId(
        Context context,
        SQLiteDatabase database,
        JSObject nodesById,
        JSONArray trashedNodeIds,
        String fallbackActiveNodeId
    ) throws Exception {
        String persistedActiveNodeId = loadWorkspaceMetaValue(context, database, ACTIVE_NODE_META_KEY);
        if (persistedActiveNodeId != null && nodesById.has(persistedActiveNodeId) && !contains(trashedNodeIds, persistedActiveNodeId)) {
            return persistedActiveNodeId;
        }
        return fallbackActiveNodeId;
    }

    private static JSObject loadUntitledSequenceByParent(Context context, SQLiteDatabase database) throws Exception {
        String rawValue = loadWorkspaceMetaValue(context, database, UNTITLED_SEQUENCE_META_KEY);
        if (rawValue == null || rawValue.trim().isEmpty()) {
            return new JSObject();
        }
        Object parsed = FolioleCompanionJsonValueParser.parse(rawValue);
        return parsed instanceof JSONObject ? new JSObject(rawValue) : new JSObject();
    }

    private static String loadWorkspaceMetaValue(Context context, SQLiteDatabase database, String key) throws Exception {
        String value = FolioleCompanionNamedQueryStore.loadString(context, database, "workspaceMetaValue", new String[] { key });
        return value == null || value.trim().isEmpty() ? null : value;
    }

    private static boolean contains(JSONArray values, String target) {
        for (int index = 0; index < values.length(); index += 1) {
            if (target.equals(values.optString(index, null))) {
                return true;
            }
        }
        return false;
    }

}
