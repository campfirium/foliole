package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionPdfPageTextStore {

    private static final int DEFAULT_SEARCH_LIMIT = 20;
    private static final int EXCERPT_RADIUS = 80;

    private FolioleCompanionPdfPageTextStore() {}

    static JSObject loadPageText(SQLiteDatabase database, String attachmentId) {
        JSObject result = new JSObject();
        JSArray pages = new JSArray();
        result.put("attachment_id", attachmentId);
        result.put("pages", pages);
        if (attachmentId == null || attachmentId.trim().isEmpty()) {
            return result;
        }
        try (Cursor cursor = database.query(
            "pdf_page_text",
            new String[] { "page", "text", "page_width", "page_height" },
            "attachment_id = ?",
            new String[] { attachmentId.trim() },
            null,
            null,
            "page ASC"
        )) {
            while (cursor.moveToNext()) {
                pages.put(toPage(cursor));
            }
        }
        return result;
    }

    static JSObject searchPageText(SQLiteDatabase database, String query, int limit) {
        JSObject result = new JSObject();
        JSArray results = new JSArray();
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        result.put("query", query);
        result.put("results", results);
        if (normalizedQuery.isEmpty()) {
            return result;
        }
        try (Cursor cursor = database.rawQuery(
            "SELECT attachment_id, page, text, page_width, page_height, instr(lower(text), ?) AS match_index " +
                "FROM pdf_page_text WHERE instr(lower(text), ?) > 0 " +
                "ORDER BY attachment_id ASC, page ASC LIMIT ?",
            new String[] { normalizedQuery, normalizedQuery, Integer.toString(resolveLimit(limit)) }
        )) {
            while (cursor.moveToNext()) {
                results.put(toSearchResult(cursor));
            }
        }
        return result;
    }

    private static int resolveLimit(int limit) {
        if (limit <= 0) {
            return DEFAULT_SEARCH_LIMIT;
        }
        return Math.min(limit, 100);
    }

    private static JSObject toPage(Cursor cursor) {
        JSObject page = new JSObject();
        page.put("page", cursor.getInt(0));
        page.put("text", cursor.getString(1));
        putNullableDouble(page, "page_width", cursor, 2);
        putNullableDouble(page, "page_height", cursor, 3);
        return page;
    }

    private static JSObject toSearchResult(Cursor cursor) {
        JSObject result = new JSObject();
        String text = cursor.getString(2);
        int matchStart = Math.max(0, cursor.getInt(5) - 1);
        result.put("attachment_id", cursor.getString(0));
        result.put("page", cursor.getInt(1));
        result.put("text", text);
        putNullableDouble(result, "page_width", cursor, 3);
        putNullableDouble(result, "page_height", cursor, 4);
        result.put("match_start", matchStart);
        result.put("excerpt", buildExcerpt(text, matchStart));
        return result;
    }

    private static String buildExcerpt(String text, int matchStart) {
        if (text == null || text.length() <= EXCERPT_RADIUS * 2) {
            return text == null ? "" : text;
        }
        int start = Math.max(0, matchStart - EXCERPT_RADIUS);
        int end = Math.min(text.length(), matchStart + EXCERPT_RADIUS);
        return text.substring(start, end).trim();
    }

    private static void putNullableDouble(JSObject target, String key, Cursor cursor, int index) {
        if (cursor.isNull(index)) {
            target.put(key, JSONObject.NULL);
        } else {
            target.put(key, cursor.getDouble(index));
        }
    }
}
