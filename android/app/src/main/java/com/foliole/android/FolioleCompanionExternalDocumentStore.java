package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionExternalDocumentStore {
    private FolioleCompanionExternalDocumentStore() {}

    static JSObject loadDocument(Context context, SQLiteDatabase database, String documentId) throws Exception {
        JSObject result = new JSObject();
        result.put(outputKey(context, "document"), JSONObject.NULL);
        if (documentId == null || documentId.trim().isEmpty()) {
            return result;
        }
        JSArray documents = FolioleCompanionGeneratedQueryRunner
            .loadRows(
                context,
                database,
                stringRule(context, "byIdQueryName"),
                stringRule(context, "documentsResultKey"),
                new String[] { documentId.trim() }
            );
        if (documents.length() > 0) {
            result.put(outputKey(context, "document"), toDocument(context, documents.getJSONObject(0)));
        }
        return result;
    }

    static JSObject loadDirectory(Context context, SQLiteDatabase database) throws Exception {
        JSObject result = new JSObject();
        result.put(
            stringRule(context, "foldersResultKey"),
            FolioleCompanionGeneratedQueryRunner.loadRows(
                context,
                database,
                stringRule(context, "foldersQueryName"),
                stringRule(context, "foldersResultKey")
            )
        );
        result.put(outputKey(context, "entries"), loadEntries(context, database));
        return result;
    }

    static JSObject searchDocuments(Context context, SQLiteDatabase database, String query, int limit) throws Exception {
        JSObject result = new JSObject();
        JSArray results = new JSArray();
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        result.put(outputKey(context, "query"), query);
        result.put(outputKey(context, "results"), results);
        if (normalizedQuery.isEmpty()) {
            return result;
        }
        JSArray documents = FolioleCompanionGeneratedQueryRunner
            .loadRows(
                context,
                database,
                stringRule(context, "searchQueryName"),
                stringRule(context, "documentsResultKey"),
                new String[] {
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                Integer.toString(resolveLimit(context, limit))
                }
            );
        for (int index = 0; index < documents.length(); index += 1) {
            results.put(toSearchResult(context, documents.getJSONObject(index)));
        }
        return result;
    }

    private static JSArray loadEntries(Context context, SQLiteDatabase database) throws Exception {
        JSArray entries = new JSArray();
        JSArray rows = FolioleCompanionGeneratedQueryRunner.loadRows(
            context,
            database,
            stringRule(context, "directoryEntriesQueryName"),
            stringRule(context, "directoryEntriesResultKey")
        );
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.getJSONObject(index);
            JSObject entry = new JSObject();
            String documentId = rowString(context, row, "documentId");
            putFields(context, entry, row, arrayRule(context, "directoryEntryFields"));
            entry.put(outputKey(context, "absolutePath"), documentId);
            entries.put(entry);
        }
        return entries;
    }

    private static JSObject toDocument(Context context, JSONObject row) throws Exception {
        JSObject document = new JSObject();
        putDocumentFields(context, document, row);
        return document;
    }

    private static JSObject toSearchResult(Context context, JSONObject row) throws Exception {
        JSObject result = new JSObject();
        putFields(context, result, row, arrayRule(context, "searchResultFields"));
        return result;
    }

    private static void putDocumentFields(Context context, JSObject target, JSONObject row) throws Exception {
        putFields(context, target, row, arrayRule(context, "documentFields"));
    }

    private static void putFields(Context context, JSObject target, JSONObject row, JSONArray fields) throws Exception {
        for (int index = 0; index < fields.length(); index += 1) {
            JSONObject field = fields.getJSONObject(index);
            target.put(fieldOutputKey(context, field), fieldValue(context, row, field));
        }
    }

    private static Object fieldValue(Context context, JSONObject row, JSONObject field) throws Exception {
        String type = fieldTypeKey(context, field);
        if (fieldType(context, "string").equals(type)) return fieldRowString(context, row, field);
        if (fieldType(context, "nullableString").equals(type)) return fieldRowNullableString(context, row, field);
        if (fieldType(context, "long").equals(type)) return fieldRowLong(context, row, field);
        throw new IllegalStateException("Unsupported external document field type: " + type);
    }

    private static int resolveLimit(Context context, int limit) throws Exception {
        if (limit <= 0) {
            return intRule(context, "defaultSearchLimit");
        }
        return Math.min(limit, intRule(context, "maxSearchLimit"));
    }

    private static String stringRule(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.externalDocumentString(context, key);
    }

    private static int intRule(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.externalDocumentInt(context, key);
    }

    private static JSONArray arrayRule(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.externalDocumentArray(context, key);
    }

    private static String outputKey(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.externalDocumentOutputKey(context, key);
    }

    private static String rowNullableString(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.externalDocumentRowNullableString(context, row, key);
    }

    private static String rowString(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.externalDocumentRowString(context, row, key);
    }

    private static String fieldOutputKey(Context context, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldOutputKey(context, field);
    }

    private static String fieldRowNullableString(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowNullableString(context, row, field);
    }

    private static long fieldRowLong(Context context, JSONObject row, JSONObject field) throws Exception {
        return FolioleCompanionQueryDefinitionShapeKeys.fieldRowLong(context, row, field);
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
