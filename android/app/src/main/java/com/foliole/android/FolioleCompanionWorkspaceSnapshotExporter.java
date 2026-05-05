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
        String contentExpression = canReadBodyBlobData ? "COALESCE(CAST(cbd.data AS TEXT), n.content)" : "n.content";
        String contentBlobJoin = canReadBodyBlobData
            ? "LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash "
            : "";
        String bodyStatusExpression = bodyStatusExpression(context, canReadBodyBlobData);

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
            String nodeId = row.getString(snapshotRule(context, "nodeIdRowKey"));
            String deletedAtRowKey = snapshotRule(context, "deletedAtRowKey");
            String deletedAt = row.isNull(deletedAtRowKey) ? null : row.getString(deletedAtRowKey);
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

    private static String bodyStatusExpression(Context context, boolean canReadBodyBlobData) throws Exception {
        String emptyStatus = sqlString(FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "empty"));
        String readyStatus = sqlString(FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "ready"));
        if (!canReadBodyBlobData) {
            return "CASE WHEN TRIM(COALESCE(n.content, '')) = '' THEN " + emptyStatus + " ELSE " + readyStatus + " END";
        }
        String fetchingStatus = sqlString(FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "fetching"));
        String failedStatus = sqlString(FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "failed"));
        String missingStatus = sqlString(FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "missing"));
        return "CASE WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL AND cb.availability IN (" +
            fetchingStatus +
            ", " +
            failedStatus +
            ") THEN cb.availability WHEN n.body_blob_hash IS NOT NULL AND cbd.hash IS NULL THEN " +
            missingStatus +
            " WHEN TRIM(COALESCE(CAST(cbd.data AS TEXT), n.content)) = '' THEN " +
            emptyStatus +
            " ELSE " +
            readyStatus +
            " END";
    }

    private static String sqlString(String value) {
        return "'" + value.replace("'", "''") + "'";
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
            result.put(rows.getJSONObject(index).getString(snapshotRule(context, "nodeIdRowKey")));
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

    private static JSONObject snapshotObject(Context context, String key) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.snapshotObject(context, key);
    }

    private static String contentBlobRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.contentBlobString(context, key);
    }

}
