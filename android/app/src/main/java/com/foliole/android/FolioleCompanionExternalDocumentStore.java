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
        JSONObject outputKeys = outputKeys(context);
        result.put(outputKeys.getString("document"), JSONObject.NULL);
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
            result.put(outputKeys.getString("document"), toDocument(context, documents.getJSONObject(0)));
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
        result.put(outputKeys(context).getString("entries"), loadEntries(context, database));
        return result;
    }

    static JSObject searchDocuments(Context context, SQLiteDatabase database, String query, int limit) throws Exception {
        JSObject result = new JSObject();
        JSArray results = new JSArray();
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        JSONObject outputKeys = outputKeys(context);
        result.put(outputKeys.getString("query"), query);
        result.put(outputKeys.getString("results"), results);
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
            String documentId = row.getString(rowKeys(context).getString("documentId"));
            putFields(context, entry, row, arrayRule(context, "directoryEntryFields"));
            entry.put(outputKeys(context).getString("absolutePath"), documentId);
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
        JSONObject outputKeys = outputKeys(context);
        int matchStart = Math.max(0, row.getInt(rowKeys(context).getString("matchIndex")) - 1);
        putDocumentFields(context, result, row);
        result.put(outputKeys.getString("matchStart"), matchStart);
        result.put(outputKeys.getString("excerpt"), buildExcerpt(context, resolveContent(context, row), matchStart));
        return result;
    }

    private static void putDocumentFields(Context context, JSObject target, JSONObject row) throws Exception {
        putFields(context, target, row, arrayRule(context, "documentFields"));
    }

    private static void putFields(Context context, JSObject target, JSONObject row, JSONArray fields) throws Exception {
        for (int index = 0; index < fields.length(); index += 1) {
            JSONObject field = fields.getJSONObject(index);
            target.put(field.getString("outputKey"), fieldValue(context, row, field));
        }
    }

    private static Object fieldValue(Context context, JSONObject row, JSONObject field) throws Exception {
        String type = field.getString("type");
        String rowKey = field.getString("rowKey");
        if ("nullableString".equals(type)) return nullableString(row, rowKey);
        if ("resolvedContent".equals(type)) return resolveContent(context, row);
        if ("contentStatus".equals(type)) return resolveContentStatus(context, row);
        throw new IllegalStateException("Unsupported external document field type: " + type);
    }

    private static String resolveContent(Context context, JSONObject row) throws Exception {
        JSONObject rowKeys = rowKeys(context);
        String bodyBlobData = nullableString(row, rowKeys.getString("bodyBlobData"));
        return bodyBlobData == null ? nullableString(row, rowKeys.getString("content")) : bodyBlobData;
    }

    private static String resolveContentStatus(Context context, JSONObject row) throws Exception {
        JSONObject rowKeys = rowKeys(context);
        String bodyBlobHash = nullableString(row, rowKeys.getString("bodyBlobHash"));
        boolean hasBodyBlobHash = bodyBlobHash != null && !bodyBlobHash.trim().isEmpty();
        if (hasBodyBlobHash && nullableString(row, rowKeys.getString("bodyBlobData")) == null) {
            String availability = nullableString(row, rowKeys.getString("availability"));
            if (FolioleCompanionSyncProtocolDefinitions.resourceStatusSet(context, "passthroughAvailabilityStatuses").contains(availability)) {
                return availability;
            }
            return FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "missing");
        }
        return FolioleCompanionSyncProtocolDefinitions.resourceStatus(context, "ready");
    }

    private static String nullableString(JSONObject row, String key) {
        return row.isNull(key) ? null : row.optString(key, null);
    }

    private static String buildExcerpt(Context context, String text, int matchStart) throws Exception {
        int excerptRadius = intRule(context, "excerptRadius");
        if (text == null || text.length() <= excerptRadius * 2) {
            return text == null ? "" : text;
        }
        int start = Math.max(0, matchStart - excerptRadius);
        int end = Math.min(text.length(), matchStart + excerptRadius);
        return text.substring(start, end).trim();
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

    private static JSONObject objectRule(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.externalDocumentObject(context, key);
    }

    private static JSONArray arrayRule(Context context, String key) throws Exception {
        return FolioleCompanionContentReadQueryRules.externalDocumentArray(context, key);
    }

    private static JSONObject outputKeys(Context context) throws Exception {
        return objectRule(context, "outputKeys");
    }

    private static JSONObject rowKeys(Context context) throws Exception {
        return objectRule(context, "rowKeys");
    }

}
