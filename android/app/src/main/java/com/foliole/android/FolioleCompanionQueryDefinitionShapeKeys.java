package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

final class FolioleCompanionQueryDefinitionShapeKeys {
    private FolioleCompanionQueryDefinitionShapeKeys() {}

    static String columnKey(Context context, String key) throws Exception {
        return section(context, "column").getString(key);
    }

    static String columnType(Context context, String key) throws Exception {
        return section(context, "columnTypes").getString(key);
    }

    static String fieldKey(Context context, String key) throws Exception {
        return section(context, "field").getString(key);
    }

    static double fieldDefaultDouble(Context context, JSONObject field, double fallback) throws Exception {
        return field.optDouble(fieldKey(context, "defaultValue"), fallback);
    }

    static long fieldDefaultLong(Context context, JSONObject field, long fallback) throws Exception {
        return field.optLong(fieldKey(context, "defaultValue"), fallback);
    }

    static String fieldDefaultRuleKey(Context context, JSONObject field) throws Exception {
        return field.getString(fieldKey(context, "defaultRuleKey"));
    }

    static boolean fieldOmitWhenNull(Context context, JSONObject field) throws Exception {
        return field.optBoolean(fieldKey(context, "omitWhenNull"), false);
    }

    static String fieldOutputKey(Context context, JSONObject field) throws Exception {
        return field.getString(fieldKey(context, "outputKey"));
    }

    static String fieldRowKey(Context context, JSONObject field) throws Exception {
        return field.getString(fieldKey(context, "rowKey"));
    }

    static String fieldTypeKey(Context context, JSONObject field) throws Exception {
        return field.getString(fieldKey(context, "type"));
    }

    static String fieldCollectionKey(Context context, String key) throws Exception {
        return section(context, "fieldCollections").getString(key);
    }

    static String fieldType(Context context, String key) throws Exception {
        return section(context, "fieldTypes").getString(key);
    }

    static String metricRowKey(Context context, String key) throws Exception {
        return section(context, "metricRow").getString(key);
    }

    static String metricRowResultKey(Context context, JSONObject metricRows) throws Exception {
        return metricRows.getString(metricRowKey(context, "resultKey"));
    }

    static String metricRowMetricKey(Context context, JSONObject metricRows) throws Exception {
        return metricRows.getString(metricRowKey(context, "metricKey"));
    }

    static String metricRowValueKey(Context context, JSONObject metricRows) throws Exception {
        return metricRows.getString(metricRowKey(context, "valueKey"));
    }

    static String queryKey(Context context, String key) throws Exception {
        return section(context, "query").getString(key);
    }

    static String diagnosticRowGroupKey(Context context, String key) throws Exception {
        return section(context, "diagnosticRowGroup").getString(key);
    }

    static String diagnosticRowGroupOutputKey(Context context, JSONObject rowGroup) throws Exception {
        return rowGroup.getString(diagnosticRowGroupKey(context, "outputKey"));
    }

    static String diagnosticRowGroupQueryKey(Context context, JSONObject rowGroup) throws Exception {
        return rowGroup.getString(diagnosticRowGroupKey(context, "queryKey"));
    }

    static String routingKey(Context context, String key) throws Exception {
        return section(context, "routing").getString(key);
    }

    private static JSONObject section(Context context, String key) throws Exception {
        return FolioleCompanionQueryAssetKeys.section(context, "queryShape").getJSONObject(key);
    }
}
