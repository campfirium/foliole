package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionExternalDocumentStore {

    private static final int DEFAULT_SEARCH_LIMIT = 20;
    private static final int EXCERPT_RADIUS = 80;

    private FolioleCompanionExternalDocumentStore() {}

    static JSObject loadDocument(Context context, SQLiteDatabase database, String documentId) throws Exception {
        JSObject result = new JSObject();
        result.put("document", JSONObject.NULL);
        if (documentId == null || documentId.trim().isEmpty()) {
            return result;
        }
        JSArray documents = FolioleCompanionNamedQueryStore
            .loadRows(context, database, "externalDocumentById", "documents", new String[] { documentId.trim() });
        if (documents.length() > 0) {
            result.put("document", toDocument(documents.getJSONObject(0)));
        }
        return result;
    }

    static JSObject loadDirectory(Context context, SQLiteDatabase database) throws Exception {
        JSObject result = new JSObject();
        result.put("folders", FolioleCompanionNamedQueryStore.loadRows(context, database, "externalSearchFolders", "folders"));
        result.put("entries", loadEntries(context, database));
        return result;
    }

    static JSObject searchDocuments(Context context, SQLiteDatabase database, String query, int limit) throws Exception {
        JSObject result = new JSObject();
        JSArray results = new JSArray();
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        result.put("query", query);
        result.put("results", results);
        if (normalizedQuery.isEmpty()) {
            return result;
        }
        JSArray documents = FolioleCompanionNamedQueryStore
            .loadRows(
                context,
                database,
                "externalDocumentSearch",
                "documents",
                new String[] {
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                Integer.toString(resolveLimit(limit))
                }
            );
        for (int index = 0; index < documents.length(); index += 1) {
            results.put(toSearchResult(documents.getJSONObject(index)));
        }
        return result;
    }

    private static JSArray loadEntries(Context context, SQLiteDatabase database) throws Exception {
        JSArray entries = new JSArray();
        JSArray rows = FolioleCompanionNamedQueryStore.loadRows(context, database, "externalDocumentDirectoryEntries", "entries");
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.getJSONObject(index);
            JSObject entry = new JSObject();
            String documentId = row.getString("document_id");
            entry.put("document_id", documentId);
            entry.put("folder_id", nullableString(row, "folder_id"));
            entry.put("relative_path", nullableString(row, "relative_path"));
            entry.put("file_name", nullableString(row, "file_name"));
            entry.put("extension", nullableString(row, "extension"));
            entry.put("title", nullableString(row, "title"));
            entry.put("opening_text", nullableString(row, "opening_text"));
            entry.put("modified_at", nullableString(row, "modified_at"));
            entry.put("absolute_path", documentId);
            entries.put(entry);
        }
        return entries;
    }

    private static JSObject toDocument(JSONObject row) throws Exception {
        JSObject document = new JSObject();
        putDocumentFields(document, row);
        return document;
    }

    private static JSObject toSearchResult(JSONObject row) throws Exception {
        JSObject result = new JSObject();
        int matchStart = Math.max(0, row.getInt("match_index") - 1);
        putDocumentFields(result, row);
        result.put("match_start", matchStart);
        result.put("excerpt", buildExcerpt(resolveContent(row), matchStart));
        return result;
    }

    private static void putDocumentFields(JSObject target, JSONObject row) {
        target.put("document_id", nullableString(row, "document_id"));
        target.put("folder_id", nullableString(row, "folder_id"));
        target.put("relative_path", nullableString(row, "relative_path"));
        target.put("file_name", nullableString(row, "file_name"));
        target.put("extension", nullableString(row, "extension"));
        target.put("title", nullableString(row, "title"));
        target.put("opening_text", nullableString(row, "opening_text"));
        target.put("content", resolveContent(row));
        target.put("content_status", resolveContentStatus(row));
        target.put("updated_at", nullableString(row, "updated_at"));
    }

    private static String resolveContent(JSONObject row) {
        String bodyBlobData = nullableString(row, "body_blob_data");
        return bodyBlobData == null ? nullableString(row, "content") : bodyBlobData;
    }

    private static String resolveContentStatus(JSONObject row) {
        String bodyBlobHash = nullableString(row, "body_blob_hash");
        boolean hasBodyBlobHash = bodyBlobHash != null && !bodyBlobHash.trim().isEmpty();
        if (hasBodyBlobHash && nullableString(row, "body_blob_data") == null) {
            String availability = nullableString(row, "availability");
            if ("fetching".equals(availability) || "failed".equals(availability)) {
                return availability;
            }
            return "missing";
        }
        return "ready";
    }

    private static String nullableString(JSONObject row, String key) {
        return row.isNull(key) ? null : row.optString(key, null);
    }

    private static String buildExcerpt(String text, int matchStart) {
        if (text == null || text.length() <= EXCERPT_RADIUS * 2) {
            return text == null ? "" : text;
        }
        int start = Math.max(0, matchStart - EXCERPT_RADIUS);
        int end = Math.min(text.length(), matchStart + EXCERPT_RADIUS);
        return text.substring(start, end).trim();
    }

    private static int resolveLimit(int limit) {
        if (limit <= 0) {
            return DEFAULT_SEARCH_LIMIT;
        }
        return Math.min(limit, 100);
    }
}
