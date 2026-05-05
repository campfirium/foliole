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
                FolioleCompanionNodeSnapshotWriter.upsertNodeSnapshot(database, nodeId, node, syncedAt);
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
            FolioleCompanionNodeSnapshotWriter.upsertNodeSnapshot(database, nodeId, node, syncedAt);
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
}
