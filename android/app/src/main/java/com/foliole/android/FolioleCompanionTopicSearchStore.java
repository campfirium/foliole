package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionTopicSearchStore {
    private FolioleCompanionTopicSearchStore() {}

    static JSObject searchTopics(Context context, SQLiteDatabase database, String query, int limit) throws Exception {
        JSObject result = new JSObject();
        JSArray results = new JSArray();
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        result.put(outputKey(context, "query"), query);
        result.put(stringRule(context, "resultKey"), results);
        if (normalizedQuery.isEmpty()) {
            return result;
        }
        JSArray rows = FolioleCompanionGeneratedQueryRunner.loadRows(
            context,
            database,
            stringRule(context, "searchQueryName"),
            stringRule(context, "resultKey"),
            new String[] {
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                Integer.toString(resolveLimit(context, limit))
            }
        );
        for (int index = 0; index < rows.length(); index += 1) {
            results.put(toSearchResult(context, rows.getJSONObject(index)));
        }
        return result;
    }

    private static int resolveLimit(Context context, int limit) throws Exception {
        if (limit <= 0) {
            return intRule(context, "defaultSearchLimit");
        }
        return Math.min(limit, intRule(context, "maxSearchLimit"));
    }

    private static JSObject toSearchResult(Context context, JSONObject row) throws Exception {
        JSObject result = new JSObject();
        JSONArray fields = arrayRule(context, "searchResultFields");
        for (int index = 0; index < fields.length(); index += 1) {
            JSONObject field = fields.getJSONObject(index);
            result.put(fieldOutputKey(context, field), fieldValue(context, row, field));
        }
        return result;
    }

    private static Object fieldValue(Context context, JSONObject row, JSONObject field) throws Exception {
        String type = fieldTypeKey(context, field);
        if (fieldType(context, "string").equals(type)) return fieldRowString(context, row, field);
        if (fieldType(context, "nullableString").equals(type)) return fieldRowNullableString(context, row, field);
        if (fieldType(context, "long").equals(type)) return fieldRowLong(context, row, field);
        throw new IllegalStateException("Unsupported topic search field type: " + type);
    }

    private static String stringRule(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.topicSearchString(context, key);
    }

    private static int intRule(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.topicSearchInt(context, key);
    }

    private static String outputKey(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.topicSearchOutputKey(context, key);
    }

    private static JSONArray arrayRule(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.topicSearchArray(context, key);
    }

    private static String fieldOutputKey(Context context, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldOutputKey(context, field);
    }

    private static long fieldRowLong(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowLong(context, row, field);
    }

    private static String fieldRowNullableString(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowNullableString(context, row, field);
    }

    private static String fieldRowString(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowString(context, row, field);
    }

    private static String fieldTypeKey(Context context, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldTypeKey(context, field);
    }

    private static String fieldType(Context context, String key) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldType(context, key);
    }
}
