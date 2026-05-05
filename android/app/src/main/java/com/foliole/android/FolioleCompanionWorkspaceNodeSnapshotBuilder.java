package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Set;

final class FolioleCompanionWorkspaceNodeSnapshotBuilder {
    private FolioleCompanionWorkspaceNodeSnapshotBuilder() {}

    static JSObject build(Context context, SQLiteDatabase database, JSONObject row, String deletedAt) throws Exception {
        JSObject node = new JSObject();
        JSONObject rules = nodePayloadRules(context);
        String nodeId = row.getString(snapshotString(context, "nodeIdRowKey"));
        putFields(context, node, row, rules.getJSONArray(fieldCollectionKey(context, "fields")), rules);
        putBodyStatus(context, node, row.getString(nodePayloadBodyStatusRowKey(context, rules)));
        JSONArray attachments = FolioleCompanionNodeAttachmentStore.loadNodeAttachments(context, database, nodeId);
        if (attachments.length() > 0) node.put(nodePayloadAttachmentsOutputKey(context, rules), attachments);
        node.put(nestedPayloadOutputKey(context, "readingPayload"), buildNestedPayload(context, row, "readingPayload"));
        node.put(nestedPayloadOutputKey(context, "reviewPayload"), buildNestedPayload(context, row, "reviewPayload"));
        if (deletedAt != null) putField(context, node, row, rules.getJSONObject(fieldCollectionKey(context, "deletedAtField")), rules);
        return node;
    }

    private static void putBodyStatus(Context context, JSObject node, String bodyStatus) throws Exception {
        JSONObject rules = nodePayloadRules(context);
        Set<String> visibleStatuses = FolioleCompanionSyncProtocolDefinitions.resourceStatusSet(context, nodePayloadVisibleBodyStatusGroup(context, rules));
        if (visibleStatuses.contains(bodyStatus)) {
            node.put(nodePayloadBodyStatusOutputKey(context, rules), bodyStatus);
        }
    }

    private static Object buildNestedPayload(Context context, JSONObject row, String groupName) throws Exception {
        JSONObject rules = snapshotObject(context, groupName);
        JSONArray requiredRowKeys = rules.getJSONArray(fieldCollectionKey(context, "requiredRowKeys"));
        for (int index = 0; index < requiredRowKeys.length(); index += 1) {
            if (row.isNull(requiredRowKeys.getString(index))) return null;
        }
        if (rules.has(fieldCollectionKey(context, "validStates"))) {
            String state = row.optString(nestedPayloadStateRowKey(context, rules), null);
            if (!contains(rules.getJSONArray(fieldCollectionKey(context, "validStates")), state)) return null;
        }
        JSObject payload = new JSObject();
        putFields(context, payload, row, rules.getJSONArray(fieldCollectionKey(context, "fields")), nodePayloadRules(context));
        return payload;
    }

    private static void putFields(Context context, JSObject target, JSONObject row, JSONArray fields, JSONObject nodeRules) throws Exception {
        for (int index = 0; index < fields.length(); index += 1) {
            putField(context, target, row, fields.getJSONObject(index), nodeRules);
        }
    }

    private static void putField(Context context, JSObject target, JSONObject row, JSONObject field, JSONObject nodeRules) throws Exception {
        String rowKey = fieldRowKey(context, field);
        if (fieldOmitWhenNull(context, field) && row.isNull(rowKey)) return;
        target.put(fieldOutputKey(context, field), fieldValue(context, row, field, nodeRules));
    }

    private static Object fieldValue(Context context, JSONObject row, JSONObject field, JSONObject nodeRules) throws Exception {
        String type = fieldTypeKey(context, field);
        if (fieldType(context, "string").equals(type)) return fieldRowString(context, row, field);
        if (fieldType(context, "nullableString").equals(type)) return fieldRowNullableString(context, row, field);
        if (fieldType(context, "long").equals(type)) return fieldRowLongOrDefault(context, row, field, 0);
        if (fieldType(context, "double").equals(type)) return fieldRowDoubleOrDefault(context, row, field, 0);
        if (fieldType(context, "booleanLong").equals(type)) return fieldRowBooleanLong(context, row, field);
        if (fieldType(context, "json").equals(type)) return FolioleCompanionJsonValueParser.parse(fieldRowNullableString(context, row, field));
        if (fieldType(context, "kind").equals(type)) return normalizeKind(context, fieldRowNullableString(context, row, field), nodeRules);
        if (fieldType(context, "title").equals(type)) return normalizeTitle(context, fieldRowNullableString(context, row, field), nodeRules);
        throw new IllegalStateException("Unsupported workspace snapshot field type: " + type);
    }

    private static String normalizeKind(Context context, String kind, JSONObject rules) throws Exception {
        return contains(nodePayloadValidKinds(context, rules), kind) ? kind : nodePayloadDefaultKind(context, rules);
    }

    private static String normalizeTitle(Context context, String title, JSONObject rules) throws Exception {
        return title == null || title.trim().isEmpty() ? nodePayloadDefaultTitle(context, rules) : title.trim();
    }

    private static boolean contains(JSONArray values, String target) {
        for (int index = 0; index < values.length(); index += 1) {
            if (values.optString(index, null).equals(target)) return true;
        }
        return false;
    }

    private static JSONObject nodePayloadRules(Context context) throws Exception {
        return snapshotObject(context, "nodePayload");
    }

    private static JSONObject snapshotObject(Context context, String key) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.snapshotObject(context, key);
    }

    private static String snapshotString(Context context, String key) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.snapshotString(context, key);
    }

    private static boolean fieldRowBooleanLong(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowBooleanLong(context, row, field);
    }

    private static double fieldRowDoubleOrDefault(Context context, JSONObject row, JSONObject field, double fallback) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowDoubleOrDefault(context, row, field, fallback);
    }

    private static long fieldRowLongOrDefault(Context context, JSONObject row, JSONObject field, long fallback) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowLongOrDefault(context, row, field, fallback);
    }

    private static String fieldRowNullableString(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowNullableString(context, row, field);
    }

    private static String fieldRowString(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowString(context, row, field);
    }

    private static boolean fieldOmitWhenNull(Context context, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldOmitWhenNull(context, field);
    }

    private static String fieldOutputKey(Context context, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldOutputKey(context, field);
    }

    private static String fieldRowKey(Context context, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowKey(context, field);
    }

    private static String fieldTypeKey(Context context, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldTypeKey(context, field);
    }

    private static String fieldCollectionKey(Context context, String key) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldCollectionKey(context, key);
    }

    private static String fieldType(Context context, String key) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldType(context, key);
    }

    private static String nestedPayloadOutputKey(Context context, String groupName) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.nestedPayloadOutputKey(context, groupName);
    }

    private static String nestedPayloadStateRowKey(Context context, JSONObject rules) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.nestedPayloadStateRowKey(context, rules);
    }

    private static String nodePayloadAttachmentsOutputKey(Context context, JSONObject rules) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.nodePayloadAttachmentsOutputKey(context, rules);
    }

    private static String nodePayloadBodyStatusOutputKey(Context context, JSONObject rules) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.nodePayloadBodyStatusOutputKey(context, rules);
    }

    private static String nodePayloadBodyStatusRowKey(Context context, JSONObject rules) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.nodePayloadBodyStatusRowKey(context, rules);
    }

    private static String nodePayloadDefaultKind(Context context, JSONObject rules) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.nodePayloadDefaultKind(context, rules);
    }

    private static String nodePayloadDefaultTitle(Context context, JSONObject rules) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.nodePayloadDefaultTitle(context, rules);
    }

    private static JSONArray nodePayloadValidKinds(Context context, JSONObject rules) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.nodePayloadValidKinds(context, rules);
    }

    private static String nodePayloadVisibleBodyStatusGroup(Context context, JSONObject rules) throws Exception {
        return FolioleCompanionWorkspaceReadQueryRules.nodePayloadVisibleBodyStatusGroup(context, rules);
    }
}
