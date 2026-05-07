package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionQueryDefinitionShapeKeys {
    private FolioleCompanionQueryDefinitionShapeKeys() {}

    private static final String ASSET_CONTENT_READ = "contentRead";
    private static final String ASSET_DIAGNOSTIC_READ = "diagnosticRead";
    private static final String ASSET_MISSING_RESOURCE_READ = "missingResourceRead";
    private static final String ASSET_NODE_ATTACHMENT_READ = "nodeAttachmentRead";
    private static final String ASSET_QUERY_SHAPE = "queryShape";
    private static final String ASSET_QUERIES = "queries";
    private static final String ASSET_RESOURCE_READ = "resourceRead";
    private static final String ASSET_RUNTIME_QUERIES = "runtimeQueries";
    private static final String ASSET_SYNC_CONFLICT_READ = "syncConflictRead";
    private static final String ASSET_SYNC_OBJECT_READ = "syncObjectRead";
    private static final String ASSET_SYNC_STREAM_READ = "syncStreamRead";
    private static final String ASSET_SYNC_PAYLOAD_ROUTING = "syncPayloadRouting";
    private static final String ASSET_WORKSPACE_READ = "workspaceRead";

    private static final String COLUMN_KEY = "key";
    private static final String COLUMN_SOURCE = "source";
    private static final String COLUMN_TYPE = "type";
    private static final String COLUMN_TYPES_DOUBLE = "double";
    private static final String COLUMN_TYPES_JSON = "json";
    private static final String COLUMN_TYPES_LONG = "long";
    private static final String FIELD_DEFAULT_RULE_KEY = "defaultRuleKey";
    private static final String FIELD_DEFAULT_VALUE = "defaultValue";
    private static final String FIELD_OMIT_WHEN_NULL = "omitWhenNull";
    private static final String FIELD_OUTPUT_KEY = "outputKey";
    private static final String FIELD_ROW_KEY = "rowKey";
    private static final String FIELD_TYPE = "type";
    private static final String FIELD_COLLECTIONS_DELETED_AT_FIELD = "deletedAtField";
    private static final String FIELD_COLLECTIONS_FIELDS = "fields";
    private static final String FIELD_COLLECTIONS_REQUIRED_ROW_KEYS = "requiredRowKeys";
    private static final String FIELD_COLLECTIONS_VALID_STATES = "validStates";
    private static final String FIELD_TYPES_BOOLEAN_LONG = "booleanLong";
    private static final String FIELD_TYPES_CONTENT_STATUS = "contentStatus";
    private static final String FIELD_TYPES_DEFAULTED_STRING = "defaultedString";
    private static final String FIELD_TYPES_DOUBLE = "double";
    private static final String FIELD_TYPES_JSON = "json";
    private static final String FIELD_TYPES_KIND = "kind";
    private static final String FIELD_TYPES_LONG = "long";
    private static final String FIELD_TYPES_NON_NEGATIVE_LONG = "nonNegativeLong";
    private static final String FIELD_TYPES_NULLABLE_NON_NEGATIVE_LONG = "nullableNonNegativeLong";
    private static final String FIELD_TYPES_NULLABLE_STRING = "nullableString";
    private static final String FIELD_TYPES_RESOLVED_CONTENT = "resolvedContent";
    private static final String FIELD_TYPES_STRING = "string";
    private static final String FIELD_TYPES_TITLE = "title";
    private static final String METRIC_ROW_METRIC_KEY = "metricKey";
    private static final String METRIC_ROW_RESULT_KEY = "resultKey";
    private static final String METRIC_ROW_VALUE_KEY = "valueKey";
    private static final String QUERY_COLUMNS = "columns";
    private static final String QUERY_RESULT_KEY = "resultKey";
    private static final String QUERY_SQL = "sql";
    private static final String QUERY_SYNC_PAYLOAD = "syncPayload";
    private static final String DIAGNOSTIC_ROW_GROUP_OUTPUT_KEY = "outputKey";
    private static final String DIAGNOSTIC_ROW_GROUP_QUERY_KEY = "queryKey";
    private static final String ROUTING_ROUTES = "routes";

    static String assetKey(String key) {
        switch (key) {
            case "contentRead": return ASSET_CONTENT_READ;
            case "diagnosticRead": return ASSET_DIAGNOSTIC_READ;
            case "missingResourceRead": return ASSET_MISSING_RESOURCE_READ;
            case "nodeAttachmentRead": return ASSET_NODE_ATTACHMENT_READ;
            case "queryShape": return ASSET_QUERY_SHAPE;
            case "queries": return ASSET_QUERIES;
            case "resourceRead": return ASSET_RESOURCE_READ;
            case "runtimeQueries": return ASSET_RUNTIME_QUERIES;
            case "syncConflictRead": return ASSET_SYNC_CONFLICT_READ;
            case "syncObjectRead": return ASSET_SYNC_OBJECT_READ;
            case "syncStreamRead": return ASSET_SYNC_STREAM_READ;
            case "syncPayloadRouting": return ASSET_SYNC_PAYLOAD_ROUTING;
            case "workspaceRead": return ASSET_WORKSPACE_READ;
            default: throw new IllegalStateException("Companion query descriptor is missing asset key: " + key);
        }
    }

    static String columnKey(Context context, String key) throws Exception {
        switch (key) {
            case "key": return COLUMN_KEY;
            case "source": return COLUMN_SOURCE;
            case "type": return COLUMN_TYPE;
            default: throw new IllegalStateException("Companion query descriptor is missing columnKey: " + key);
        }
    }

    static String columnType(Context context, String key) throws Exception {
        switch (key) {
            case "double": return COLUMN_TYPES_DOUBLE;
            case "json": return COLUMN_TYPES_JSON;
            case "long": return COLUMN_TYPES_LONG;
            default: throw new IllegalStateException("Companion query descriptor is missing columnType: " + key);
        }
    }


    static String fieldCollectionKey(Context context, String key) throws Exception {
        switch (key) {
            case "deletedAtField": return FIELD_COLLECTIONS_DELETED_AT_FIELD;
            case "fields": return FIELD_COLLECTIONS_FIELDS;
            case "requiredRowKeys": return FIELD_COLLECTIONS_REQUIRED_ROW_KEYS;
            case "validStates": return FIELD_COLLECTIONS_VALID_STATES;
            default: throw new IllegalStateException("Companion query descriptor is missing fieldCollectionKey: " + key);
        }
    }

    static String fieldType(Context context, String key) throws Exception {
        switch (key) {
            case "booleanLong": return FIELD_TYPES_BOOLEAN_LONG;
            case "contentStatus": return FIELD_TYPES_CONTENT_STATUS;
            case "defaultedString": return FIELD_TYPES_DEFAULTED_STRING;
            case "double": return FIELD_TYPES_DOUBLE;
            case "json": return FIELD_TYPES_JSON;
            case "kind": return FIELD_TYPES_KIND;
            case "long": return FIELD_TYPES_LONG;
            case "nonNegativeLong": return FIELD_TYPES_NON_NEGATIVE_LONG;
            case "nullableNonNegativeLong": return FIELD_TYPES_NULLABLE_NON_NEGATIVE_LONG;
            case "nullableString": return FIELD_TYPES_NULLABLE_STRING;
            case "resolvedContent": return FIELD_TYPES_RESOLVED_CONTENT;
            case "string": return FIELD_TYPES_STRING;
            case "title": return FIELD_TYPES_TITLE;
            default: throw new IllegalStateException("Companion query descriptor is missing fieldType: " + key);
        }
    }


    static String queryKey(Context context, String key) throws Exception {
        switch (key) {
            case "columns": return QUERY_COLUMNS;
            case "resultKey": return QUERY_RESULT_KEY;
            case "sql": return QUERY_SQL;
            case "syncPayload": return QUERY_SYNC_PAYLOAD;
            default: throw new IllegalStateException("Companion query descriptor is missing queryKey: " + key);
        }
    }


    static String routingKey(Context context, String key) throws Exception {
        switch (key) {
            case "routes": return ROUTING_ROUTES;
            default: throw new IllegalStateException("Companion query descriptor is missing routingKey: " + key);
        }
    }

    static double fieldDefaultDouble(Context context, JSONObject field, double fallback) throws Exception {
        return field.optDouble(FIELD_DEFAULT_VALUE, fallback);
    }

    static long fieldDefaultLong(Context context, JSONObject field, long fallback) throws Exception {
        return field.optLong(FIELD_DEFAULT_VALUE, fallback);
    }

    static String fieldDefaultRuleKey(Context context, JSONObject field) throws Exception {
        return field.getString(FIELD_DEFAULT_RULE_KEY);
    }

    static boolean fieldOmitWhenNull(Context context, JSONObject field) throws Exception {
        return field.optBoolean(FIELD_OMIT_WHEN_NULL, false);
    }

    static String fieldOutputKey(Context context, JSONObject field) throws Exception {
        return field.getString(FIELD_OUTPUT_KEY);
    }

    static String fieldRowKey(Context context, JSONObject field) throws Exception {
        return field.getString(FIELD_ROW_KEY);
    }

    static boolean fieldRowBooleanLong(Context context, JSONObject row, JSONObject field) throws Exception {
        return fieldRowLong(context, row, field) == 1;
    }

    static double fieldRowDoubleOrDefault(Context context, JSONObject row, JSONObject field, double fallback) throws Exception {
        return row.isNull(fieldRowKey(context, field)) ? fieldDefaultDouble(context, field, fallback) : fieldRowDouble(context, row, field);
    }

    static long fieldRowLong(Context context, JSONObject row, JSONObject field) throws Exception {
        return row.getLong(fieldRowKey(context, field));
    }

    static long fieldRowLongOrDefault(Context context, JSONObject row, JSONObject field, long fallback) throws Exception {
        return row.isNull(fieldRowKey(context, field)) ? fieldDefaultLong(context, field, fallback) : fieldRowLong(context, row, field);
    }

    static Object fieldRowNullableNonNegativeLong(Context context, JSONObject row, JSONObject field) throws Exception {
        return row.isNull(fieldRowKey(context, field)) ? JSONObject.NULL : Math.max(0, fieldRowLong(context, row, field));
    }

    static String fieldRowNullableString(Context context, JSONObject row, JSONObject field) throws Exception {
        String key = fieldRowKey(context, field);
        return row.isNull(key) ? null : row.optString(key, null);
    }

    static String fieldRowString(Context context, JSONObject row, JSONObject field) throws Exception {
        return row.getString(fieldRowKey(context, field));
    }

    static String fieldTypeKey(Context context, JSONObject field) throws Exception {
        return field.getString(FIELD_TYPE);
    }

    static String metricRowResultKey(Context context, JSONObject metricRows) throws Exception {
        return metricRows.getString(METRIC_ROW_RESULT_KEY);
    }

    static String metricRowMetricKey(Context context, JSONObject metricRows) throws Exception {
        return metricRows.getString(METRIC_ROW_METRIC_KEY);
    }

    static String metricRowValueKey(Context context, JSONObject metricRows) throws Exception {
        return metricRows.getString(METRIC_ROW_VALUE_KEY);
    }

    static String diagnosticRowGroupOutputKey(Context context, JSONObject rowGroup) throws Exception {
        return rowGroup.getString(DIAGNOSTIC_ROW_GROUP_OUTPUT_KEY);
    }

    static String diagnosticRowGroupQueryKey(Context context, JSONObject rowGroup) throws Exception {
        return rowGroup.getString(DIAGNOSTIC_ROW_GROUP_QUERY_KEY);
    }

    private static double fieldRowDouble(Context context, JSONObject row, JSONObject field) throws Exception {
        return row.getDouble(fieldRowKey(context, field));
    }

}
