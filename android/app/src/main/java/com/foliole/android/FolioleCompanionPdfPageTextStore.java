package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionPdfPageTextStore {

    private FolioleCompanionPdfPageTextStore() {}

    static JSObject loadPageText(Context context, SQLiteDatabase database, String attachmentId) throws Exception {
        JSObject result = new JSObject();
        result.put(stringRule(context, "attachmentIdKey"), attachmentId);
        result.put(stringRule(context, "pagesResultKey"), new JSArray());
        if (attachmentId == null || attachmentId.trim().isEmpty()) {
            return result;
        }
        JSObject loaded = FolioleCompanionGeneratedQueryRunner.load(
            context,
            database,
            stringRule(context, "pagesQueryName"),
            new String[] { attachmentId.trim() }
        );
        loaded.put(stringRule(context, "attachmentIdKey"), attachmentId);
        return loaded;
    }

    static JSObject searchPageText(Context context, SQLiteDatabase database, String query, int limit) throws Exception {
        JSObject result = new JSObject();
        JSArray results = new JSArray();
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        result.put("query", query);
        result.put(stringRule(context, "searchResultKey"), results);
        if (normalizedQuery.isEmpty()) {
            return result;
        }
        JSArray rows = FolioleCompanionGeneratedQueryRunner.loadRows(
            context,
            database,
            stringRule(context, "searchQueryName"),
            stringRule(context, "searchResultKey"),
            new String[] { normalizedQuery, normalizedQuery, Integer.toString(resolveLimit(context, limit)) }
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
        String text = row.optString(stringRule(context, "textKey"), "");
        int matchStart = Math.max(0, row.optInt(stringRule(context, "matchIndexKey")) - 1);
        result.put(stringRule(context, "attachmentIdKey"), row.getString(stringRule(context, "attachmentIdKey")));
        result.put(stringRule(context, "pageKey"), row.getInt(stringRule(context, "pageKey")));
        result.put(stringRule(context, "textKey"), text);
        result.put(stringRule(context, "pageWidthKey"), row.opt(stringRule(context, "pageWidthKey")));
        result.put(stringRule(context, "pageHeightKey"), row.opt(stringRule(context, "pageHeightKey")));
        result.put("match_start", matchStart);
        result.put("excerpt", buildExcerpt(context, text, matchStart));
        return result;
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

    private static int intRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.pdfPageTextInt(context, key);
    }

    private static String stringRule(Context context, String key) throws Exception {
        return FolioleCompanionResourceReadQueryRules.pdfPageTextString(context, key);
    }

}
