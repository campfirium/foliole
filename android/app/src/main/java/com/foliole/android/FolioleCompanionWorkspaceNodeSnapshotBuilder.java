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
        putBodyStatus(context, node, row.getString(rules.getString("bodyStatusRowKey")));
        JSONArray attachments = FolioleCompanionNodeAttachmentStore.loadNodeAttachments(context, database, nodeId);
        if (attachments.length() > 0) node.put(rules.getString("attachmentsOutputKey"), attachments);
        node.put(payloadString(context, "readingPayload", "outputKey"), buildNestedPayload(context, row, "readingPayload"));
        node.put(payloadString(context, "reviewPayload", "outputKey"), buildNestedPayload(context, row, "reviewPayload"));
        if (deletedAt != null) putField(context, node, row, rules.getJSONObject(fieldCollectionKey(context, "deletedAtField")), rules);
        return node;
    }

    private static void putBodyStatus(Context context, JSObject node, String bodyStatus) throws Exception {
        JSONObject rules = nodePayloadRules(context);
        Set<String> visibleStatuses = FolioleCompanionSyncProtocolDefinitions.resourceStatusSet(context, rules.getString("visibleBodyStatusGroup"));
        if (visibleStatuses.contains(bodyStatus)) {
            node.put(rules.getString("bodyStatusOutputKey"), bodyStatus);
        }
    }

    private static Object buildNestedPayload(Context context, JSONObject row, String groupName) throws Exception {
        JSONObject rules = snapshotObject(context, groupName);
        JSONArray requiredRowKeys = rules.getJSONArray(fieldCollectionKey(context, "requiredRowKeys"));
        for (int index = 0; index < requiredRowKeys.length(); index += 1) {
            if (row.isNull(requiredRowKeys.getString(index))) return null;
        }
        if (rules.has(fieldCollectionKey(context, "validStates"))) {
            String state = row.optString(rules.getString("stateRowKey"), null);
            if (!contains(rules.getJSONArray(fieldCollectionKey(context, "validStates")), state)) return null;
        }
        JSObject payload = new JSObject();
        putFields(context, payload, row, rules.getJSONArray(fieldCollectionKey(context, "fields")), nodePayloadRules(context));
        return payload;
    }

    private static String nullableString(JSONObject row, String key) {
        return row.isNull(key) ? null : row.optString(key, null);
    }

    private static void putFields(Context context, JSObject target, JSONObject row, JSONArray fields, JSONObject nodeRules) throws Exception {
        for (int index = 0; index < fields.length(); index += 1) {
            putField(context, target, row, fields.getJSONObject(index), nodeRules);
        }
    }

    private static void putField(Context context, JSObject target, JSONObject row, JSONObject field, JSONObject nodeRules) throws Exception {
        String rowKey = field.getString(fieldKey(context, "rowKey"));
        if (field.optBoolean(fieldKey(context, "omitWhenNull"), false) && row.isNull(rowKey)) return;
        target.put(field.getString(fieldKey(context, "outputKey")), fieldValue(context, row, field, nodeRules));
    }

    private static Object fieldValue(Context context, JSONObject row, JSONObject field, JSONObject nodeRules) throws Exception {
        String rowKey = field.getString(fieldKey(context, "rowKey"));
        String type = field.getString(fieldKey(context, "type"));
        if (fieldType(context, "string").equals(type)) return row.getString(rowKey);
        if (fieldType(context, "nullableString").equals(type)) return nullableString(row, rowKey);
        if (fieldType(context, "long").equals(type)) return row.isNull(rowKey) ? field.optLong(fieldKey(context, "defaultValue"), 0) : row.getLong(rowKey);
        if (fieldType(context, "double").equals(type)) return row.isNull(rowKey) ? field.optDouble(fieldKey(context, "defaultValue"), 0) : row.getDouble(rowKey);
        if (fieldType(context, "booleanLong").equals(type)) return row.getLong(rowKey) == 1;
        if (fieldType(context, "json").equals(type)) return FolioleCompanionJsonValueParser.parse(nullableString(row, rowKey));
        if (fieldType(context, "kind").equals(type)) return normalizeKind(nullableString(row, rowKey), nodeRules);
        if (fieldType(context, "title").equals(type)) return normalizeTitle(nullableString(row, rowKey), nodeRules);
        throw new IllegalStateException("Unsupported workspace snapshot field type: " + type);
    }

    private static String normalizeKind(String kind, JSONObject rules) throws Exception {
        return contains(rules.getJSONArray("validKinds"), kind) ? kind : rules.getString("defaultKind");
    }

    private static String normalizeTitle(String title, JSONObject rules) throws Exception {
        return title == null || title.trim().isEmpty() ? rules.getString("defaultTitle") : title.trim();
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

    private static String payloadString(Context context, String groupName, String key) throws Exception {
        return snapshotObject(context, groupName).getString(key);
    }

    private static String fieldKey(Context context, String key) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldKey(context, key);
    }

    private static String fieldCollectionKey(Context context, String key) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldCollectionKey(context, key);
    }

    private static String fieldType(Context context, String key) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldType(context, key);
    }
}
