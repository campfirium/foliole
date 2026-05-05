package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

final class FolioleCompanionWorkspaceSnapshotExporter {
    private FolioleCompanionWorkspaceSnapshotExporter() {}

    static JSObject loadWorkspaceSnapshot(Context context, SQLiteDatabase database, String deviceId) throws Exception {
        JSONArray orderedNodeIds = loadOrderedNodeIds(context, database);
        if (orderedNodeIds.length() == 0) {
            return null;
        }
        boolean canReadBodyBlobData = FolioleCompanionSqliteRuntime.tableExists(database, contentBlobRule(context, "dataTableName"));
        String contentExpression = snapshotRule(context, canReadBodyBlobData ? "contentExpressionWithBodyBlobSql" : "contentExpressionInlineSql");
        String contentBlobJoin = canReadBodyBlobData ? snapshotRule(context, "contentBlobJoinSql") : "";
        String bodyStatusExpression = snapshotRule(context, canReadBodyBlobData ? "bodyStatusExpressionWithBodyBlobSql" : "bodyStatusExpressionInlineSql");

        JSObject nodesById = new JSObject();
        JSONArray trashedNodeIds = new JSONArray();
        String firstActiveNodeId = null;

        JSONArray nodes = FolioleCompanionGeneratedQueryRunner.loadRows(
            context,
            database,
            snapshotRule(context, "nodesQueryName"),
            snapshotRule(context, "nodesResultKey"),
            snapshotQueryReplacements(context, contentExpression, contentBlobJoin, bodyStatusExpression),
            new String[] { deviceId }
        );
        for (int index = 0; index < nodes.length(); index += 1) {
            JSONObject row = nodes.getJSONObject(index);
            String nodeId = snapshotRowString(context, row, "nodeIdRowKey");
            String deletedAt = snapshotRowNullableString(context, row, "deletedAtRowKey");
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
        snapshot.put(snapshotOutputKey(context, "activeNodeId"), resolveActiveNodeId(context, database, nodesById, trashedNodeIds, firstActiveNodeId));
        snapshot.put(snapshotOutputKey(context, "nodeOrder"), orderedNodeIds);
        snapshot.put(snapshotOutputKey(context, "nodesById"), nodesById);
        snapshot.put(snapshotOutputKey(context, "persistedNodeViewById"), FolioleCompanionWorkspaceViewStateExporter.loadPersistedNodeViewById(context, database, deviceId));
        snapshot.put(snapshotOutputKey(context, "trashedNodeIds"), trashedNodeIds);
        snapshot.put(snapshotOutputKey(context, "untitledSequenceByParent"), loadUntitledSequenceByParent(context, database));
        return snapshot;
    }

    private static Map<String, String> snapshotQueryReplacements(
        Context context,
        String contentExpression,
        String contentBlobJoin,
        String bodyStatusExpression
    ) throws Exception {
        Map<String, String> replacements = new HashMap<>();
        replacements.put(snapshotRule(context, "contentExpressionToken"), contentExpression);
        replacements.put(snapshotRule(context, "contentBlobJoinToken"), contentBlobJoin);
        replacements.put(snapshotRule(context, "bodyStatusExpressionToken"), bodyStatusExpression);
        return replacements;
    }

    private static JSONArray loadOrderedNodeIds(Context context, SQLiteDatabase database) throws Exception {
        JSONArray result = new JSONArray();
        JSONArray rows = FolioleCompanionGeneratedQueryRunner.loadRows(
            context,
            database,
            snapshotRule(context, "orderedNodeIdsQueryName"),
            snapshotRule(context, "orderedNodeIdsResultKey")
        );
        for (int index = 0; index < rows.length(); index += 1) {
            result.put(snapshotRowString(context, rows.getJSONObject(index), "nodeIdRowKey"));
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
        String persistedActiveNodeId = loadWorkspaceMetaValue(context, database, FolioleCompanionSyncPayloadQueryStore.viewActiveNodeWorkspaceMetaKey(context));
        if (persistedActiveNodeId != null && nodesById.has(persistedActiveNodeId) && !contains(trashedNodeIds, persistedActiveNodeId)) {
            return persistedActiveNodeId;
        }
        return fallbackActiveNodeId;
    }

    private static JSObject loadUntitledSequenceByParent(Context context, SQLiteDatabase database) throws Exception {
        String rawValue = loadWorkspaceMetaValue(context, database, snapshotRule(context, "untitledSequenceMetaKey"));
        if (rawValue == null || rawValue.trim().isEmpty()) {
            return new JSObject();
        }
        Object parsed = FolioleCompanionJsonValueParser.parse(rawValue);
        return parsed instanceof JSONObject ? new JSObject(rawValue) : new JSObject();
    }

    private static String loadWorkspaceMetaValue(Context context, SQLiteDatabase database, String key) throws Exception {
        String value = FolioleCompanionGeneratedQueryRunner.loadString(
            context,
            database,
            snapshotRule(context, "metaValueQueryName"),
            new String[] { key }
        );
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

    private static String snapshotRule(Context context, String key) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.snapshotString(context, key);
    }

    private static String snapshotOutputKey(Context context, String key) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.snapshotOutputKey(context, key);
    }

    private static String snapshotRowString(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.snapshotRowString(context, row, key);
    }

    private static String snapshotRowNullableString(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.snapshotRowNullableString(context, row, key);
    }

    private static String contentBlobRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.contentBlobString(context, key);
    }

}
