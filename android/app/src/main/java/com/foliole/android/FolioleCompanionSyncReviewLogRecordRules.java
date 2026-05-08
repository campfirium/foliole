package com.foliole.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncReviewLogRecordRules {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

    private FolioleCompanionSyncReviewLogRecordRules() {}

    static String string(Context context, String queryName, JSONObject record, String key, String fallback) throws Exception {
        return record.optString(columnSource(context, queryName, key), fallback);
    }

    static int intValue(Context context, String queryName, JSONObject record, String key, int fallback) throws Exception {
        return record.optInt(columnSource(context, queryName, key), fallback);
    }

    static double doubleValue(Context context, String queryName, JSONObject record, String key, double fallback) throws Exception {
        return record.optDouble(columnSource(context, queryName, key), fallback);
    }

    static String key(Context context, String queryName, String key) throws Exception {
        return columnSource(context, queryName, key);
    }

    private static String columnSource(Context context, String queryName, String key) throws Exception {
        JSONArray columns = query(context, queryName).getJSONArray(FolioleCompanionQueryDefinitionShapeKeys.queryKey(context, "columns"));
        for (int index = 0; index < columns.length(); index += 1) {
            JSONObject column = columns.getJSONObject(index);
            if (key.equals(column.optString(FolioleCompanionQueryDefinitionShapeKeys.columnKey(context, "key")))) {
                return column.getString(FolioleCompanionQueryDefinitionShapeKeys.columnKey(context, "source"));
            }
        }
        throw new IllegalStateException("Companion query definitions asset is missing sync review log column: " + key);
    }

    private static JSONObject query(Context context, String queryName) throws Exception {
        JSONObject queries = FolioleCompanionJsonAssetCache.object(context, QUERY_ASSET_PATH)
            .optJSONObject(FolioleCompanionQueryAssetKeys.key(context, "queries"));
        JSONObject query = queries == null ? null : queries.optJSONObject(queryName);
        if (query == null) {
            throw new IllegalStateException("Companion query definitions asset is missing query: " + queryName);
        }
        return query;
    }
}
