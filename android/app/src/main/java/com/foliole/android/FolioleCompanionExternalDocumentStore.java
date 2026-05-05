package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionExternalDocumentStore {

    private static final int DEFAULT_SEARCH_LIMIT = 20;
    private static final int EXCERPT_RADIUS = 80;

    private FolioleCompanionExternalDocumentStore() {}

    static JSObject loadDocument(SQLiteDatabase database, String documentId) {
        JSObject result = new JSObject();
        result.put("document", JSONObject.NULL);
        if (documentId == null || documentId.trim().isEmpty()) {
            return result;
        }
        try (Cursor cursor = database.rawQuery(
            "SELECT document_id, folder_id, relative_path, file_name, extension, title, opening_text, " +
                "ed.content, ed.body_blob_hash, CAST(cbd.data AS TEXT) AS body_blob_data, cb.availability, updated_at " +
                "FROM external_documents ed " +
                "LEFT JOIN content_blobs cb ON cb.hash = ed.body_blob_hash " +
                "LEFT JOIN content_blob_data cbd ON cbd.hash = ed.body_blob_hash " +
                "WHERE document_id = ? AND is_present = 1 LIMIT 1",
            new String[] { documentId.trim() }
        )) {
            if (cursor.moveToFirst()) {
                result.put("document", toDocument(cursor));
            }
        }
        return result;
    }

    static JSObject searchDocuments(SQLiteDatabase database, String query, int limit) {
        JSObject result = new JSObject();
        JSArray results = new JSArray();
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        result.put("query", query);
        result.put("results", results);
        if (normalizedQuery.isEmpty()) {
            return result;
        }
        try (Cursor cursor = database.rawQuery(
            "SELECT document_id, folder_id, relative_path, file_name, extension, title, opening_text, " +
                "ed.content, ed.body_blob_hash, CAST(cbd.data AS TEXT) AS body_blob_data, cb.availability, updated_at, " +
                "instr(lower(COALESCE(CAST(cbd.data AS TEXT), ed.content)), ?) AS match_index " +
                "FROM external_documents ed " +
                "LEFT JOIN content_blobs cb ON cb.hash = ed.body_blob_hash " +
                "LEFT JOIN content_blob_data cbd ON cbd.hash = ed.body_blob_hash " +
                "WHERE is_present = 1 " +
                "AND (instr(lower(title), ?) > 0 OR instr(lower(file_name), ?) > 0 " +
                "OR instr(lower(relative_path), ?) > 0 OR instr(lower(coalesce(opening_text, '')), ?) > 0 " +
                "OR instr(lower(COALESCE(CAST(cbd.data AS TEXT), ed.content)), ?) > 0) " +
                "ORDER BY updated_at DESC LIMIT ?",
            new String[] {
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                normalizedQuery,
                Integer.toString(resolveLimit(limit))
            }
        )) {
            while (cursor.moveToNext()) {
                results.put(toSearchResult(cursor));
            }
        }
        return result;
    }

    private static JSObject toDocument(Cursor cursor) {
        JSObject document = new JSObject();
        putDocumentFields(document, cursor);
        return document;
    }

    private static JSObject toSearchResult(Cursor cursor) {
        JSObject result = new JSObject();
        int matchStart = Math.max(0, cursor.getInt(12) - 1);
        putDocumentFields(result, cursor);
        result.put("match_start", matchStart);
        result.put("excerpt", buildExcerpt(resolveContent(cursor), matchStart));
        return result;
    }

    private static void putDocumentFields(JSObject target, Cursor cursor) {
        target.put("document_id", cursor.getString(0));
        target.put("folder_id", cursor.getString(1));
        target.put("relative_path", cursor.getString(2));
        target.put("file_name", cursor.getString(3));
        target.put("extension", cursor.getString(4));
        target.put("title", cursor.getString(5));
        target.put("opening_text", cursor.getString(6));
        target.put("content", resolveContent(cursor));
        target.put("content_status", resolveContentStatus(cursor));
        target.put("updated_at", cursor.getString(11));
    }

    private static String resolveContent(Cursor cursor) {
        String bodyBlobData = cursor.isNull(9) ? null : cursor.getString(9);
        return bodyBlobData == null ? cursor.getString(7) : bodyBlobData;
    }

    private static String resolveContentStatus(Cursor cursor) {
        String bodyBlobHash = cursor.isNull(8) ? null : cursor.getString(8);
        boolean hasBodyBlobHash = bodyBlobHash != null && !bodyBlobHash.trim().isEmpty();
        if (hasBodyBlobHash && cursor.isNull(9)) {
            String availability = cursor.isNull(10) ? null : cursor.getString(10);
            if ("fetching".equals(availability) || "failed".equals(availability)) {
                return availability;
            }
            return "missing";
        }
        return "ready";
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
