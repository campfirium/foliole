package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionReadableArticleQuery {
    private FolioleCompanionReadableArticleQuery() {}

    static JSObject loadReadableArticle(Context context, SQLiteDatabase database) throws Exception {
        String activeNodeId = loadActiveNodeId(context, database);

        if (activeNodeId != null) {
            JSObject activeArticle = loadArticleByNodeId(context, database, activeNodeId);
            if (activeArticle != null) {
                return wrap(context, activeArticle);
            }
        }

        JSONObject article = FolioleCompanionGeneratedQueryRunner.loadFirstRow(
            context,
            database,
            stringRule(context, "firstNodeQueryName"),
            stringRule(context, "articlesResultKey"),
            null
        );
        if (article == null) {
            return wrap(context, null);
        }
        return wrap(context, buildArticle(context, article));
    }

    private static String loadActiveNodeId(Context context, SQLiteDatabase database) throws Exception {
        String value = FolioleCompanionGeneratedQueryRunner.loadString(context, database, stringRule(context, "activeNodeIdQueryName"), null);
        return value == null || value.trim().isEmpty() ? null : value;
    }

    private static JSObject loadArticleByNodeId(Context context, SQLiteDatabase database, String nodeId) throws Exception {
        JSONObject article = FolioleCompanionGeneratedQueryRunner.loadFirstRow(
            context,
            database,
            stringRule(context, "byNodeIdQueryName"),
            stringRule(context, "articlesResultKey"),
            new String[] { nodeId }
        );
        if (article == null) {
            return null;
        }
        return buildArticle(context, article);
    }

    private static JSObject buildArticle(Context context, JSONObject row) throws Exception {
        JSObject article = new JSObject();
        JSONArray fields = arrayRule(context, "articleFields");
        for (int index = 0; index < fields.length(); index += 1) {
            JSONObject field = fields.getJSONObject(index);
            article.put(fieldOutputKey(context, field), fieldValue(context, row, field));
        }
        return article;
    }

    private static Object fieldValue(Context context, JSONObject row, JSONObject field) throws Exception {
        String type = fieldTypeKey(context, field);
        if (fieldType(context, "string").equals(type)) return fieldRowString(context, row, field);
        if (fieldType(context, "nullableString").equals(type)) return fieldRowNullableString(context, row, field);
        throw new IllegalStateException("Unsupported readable article field type: " + type);
    }

    private static JSObject wrap(Context context, JSObject article) throws Exception {
        JSObject payload = new JSObject();
        payload.put(stringRule(context, "articleResultKey"), article == null ? null : article);
        return payload;
    }

    private static String stringRule(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.readableArticleString(context, key);
    }

    private static String outputKey(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.readableArticleOutputKey(context, key);
    }

    private static JSONArray arrayRule(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.readableArticleArray(context, key);
    }

    private static String fieldOutputKey(Context context, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldOutputKey(context, field);
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
