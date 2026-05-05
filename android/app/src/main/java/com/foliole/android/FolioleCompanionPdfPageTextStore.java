package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionPdfPageTextStore {

    private static final int DEFAULT_SEARCH_LIMIT = 20;
    private static final int EXCERPT_RADIUS = 80;

    private FolioleCompanionPdfPageTextStore() {}

    static JSObject loadPageText(Context context, SQLiteDatabase database, String attachmentId) throws Exception {
        JSObject result = new JSObject();
        result.put("attachment_id", attachmentId);
        result.put("pages", new JSArray());
        if (attachmentId == null || attachmentId.trim().isEmpty()) {
            return result;
        }
        JSObject loaded = FolioleCompanionNamedQueryStore.loadArray(
            context,
            database,
            "pdfPageTextPages",
            new String[] { attachmentId.trim() }
        );
        loaded.put("attachment_id", attachmentId);
        return loaded;
    }

    static JSObject searchPageText(Context context, SQLiteDatabase database, String query, int limit) throws Exception {
        JSObject result = new JSObject();
        JSArray results = new JSArray();
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        result.put("query", query);
        result.put("results", results);
        if (normalizedQuery.isEmpty()) {
            return result;
        }
        JSONArray rows = FolioleCompanionNamedQueryStore.loadArray(
            context,
            database,
            "pdfPageTextSearch",
            new String[] { normalizedQuery, normalizedQuery, Integer.toString(resolveLimit(limit)) }
        ).getJSONArray("results");
        for (int index = 0; index < rows.length(); index += 1) {
            results.put(toSearchResult(rows.getJSONObject(index)));
        }
        return result;
    }

    private static int resolveLimit(int limit) {
        if (limit <= 0) {
            return DEFAULT_SEARCH_LIMIT;
        }
        return Math.min(limit, 100);
    }

    private static JSObject toSearchResult(JSONObject row) throws Exception {
        JSObject result = new JSObject();
        String text = row.optString("text", "");
        int matchStart = Math.max(0, row.optInt("match_index") - 1);
        result.put("attachment_id", row.getString("attachment_id"));
        result.put("page", row.getInt("page"));
        result.put("text", text);
        result.put("page_width", row.opt("page_width"));
        result.put("page_height", row.opt("page_height"));
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

}
