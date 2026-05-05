package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Map;

final class FolioleCompanionNamedQueryStore {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

    private FolioleCompanionNamedQueryStore() {}

    static JSObject loadArray(Context context, SQLiteDatabase database, String queryName) throws Exception {
        return loadArray(context, database, queryName, null);
    }

    static JSObject loadArray(Context context, SQLiteDatabase database, String queryName, String[] args) throws Exception {
        return loadArray(context, database, queryName, null, args);
    }

    static JSObject loadArray(
        Context context,
        SQLiteDatabase database,
        String queryName,
        Map<String, String> replacements,
        String[] args
    ) throws Exception {
        JSONObject query = loadQuery(context, queryName);
        String resultKey = query.getString("resultKey");
        String sql = replaceTokens(query.getString("sql"), replacements);
        JSONArray columns = query.getJSONArray("columns");
        JSArray rows = new JSArray();
        try (Cursor cursor = database.rawQuery(sql, args)) {
            while (cursor.moveToNext()) {
                rows.put(toRecord(cursor, columns));
            }
        }
        JSObject result = new JSObject();
        result.put(resultKey, rows);
        return result;
    }

    static String loadString(Context context, SQLiteDatabase database, String queryName, String[] args) throws Exception {
        JSONObject query = loadQuery(context, queryName);
        String sql = replaceTokens(query.getString("sql"), null);
        try (Cursor cursor = database.rawQuery(sql, args)) {
            if (!cursor.moveToFirst() || cursor.isNull(0)) {
                return null;
            }
            return cursor.getString(0);
        }
    }

    static JSObject loadLongMetrics(Context context, SQLiteDatabase database, String queryName) throws Exception {
        JSONObject metricRows = FolioleCompanionSyncDiagnosticQueryRules.object(context, "metricRows");
        JSONArray metrics = loadArray(context, database, queryName).getJSONArray(metricRows.getString("resultKey"));
        JSObject result = new JSObject();
        for (int index = 0; index < metrics.length(); index += 1) {
            JSONObject metric = metrics.getJSONObject(index);
            result.put(metric.getString(metricRows.getString("metricKey")), metric.getLong(metricRows.getString("valueKey")));
        }
        return result;
    }

    static JSArray loadRows(Context context, SQLiteDatabase database, String queryName, String resultKey) throws Exception {
        return loadRows(context, database, queryName, resultKey, null);
    }

    static JSArray loadRows(Context context, SQLiteDatabase database, String queryName, String resultKey, String[] args) throws Exception {
        return loadRows(context, database, queryName, resultKey, null, args);
    }

    static JSArray loadRows(
        Context context,
        SQLiteDatabase database,
        String queryName,
        String resultKey,
        Map<String, String> replacements,
        String[] args
    ) throws Exception {
        JSONArray rows = loadArray(context, database, queryName, replacements, args).getJSONArray(resultKey);
        JSArray result = new JSArray();
        for (int index = 0; index < rows.length(); index += 1) {
            result.put(rows.getJSONObject(index));
        }
        return result;
    }

    static JSONObject loadFirstRow(Context context, SQLiteDatabase database, String queryName, String resultKey, String[] args) throws Exception {
        JSONArray rows = loadRows(context, database, queryName, resultKey, args);
        return rows.length() <= 0 ? null : rows.getJSONObject(0);
    }

    static boolean hasRows(Context context, SQLiteDatabase database, String queryName, String resultKey, String[] args) throws Exception {
        return loadFirstRow(context, database, queryName, resultKey, args) != null;
    }

    private static String replaceTokens(String sql, Map<String, String> replacements) {
        if (replacements == null) {
            return sql;
        }
        String replaced = sql;
        for (Map.Entry<String, String> entry : replacements.entrySet()) {
            replaced = replaced.replace(entry.getKey(), entry.getValue());
        }
        return replaced;
    }

    private static JSONObject loadQuery(Context context, String queryName) throws Exception {
        JSONObject queries = loadQueries(context);
        JSONObject query = queries.optJSONObject(queryName);
        if (query == null) {
            throw new IllegalStateException("Companion query definitions asset is missing query: " + queryName);
        }
        return query;
    }

    private static JSONObject loadQueries(Context context) throws Exception {
        JSONObject payload = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH));
        JSONObject queries = payload.optJSONObject("queries");
        if (queries == null) {
            throw new IllegalStateException("Companion query definitions asset is missing queries.");
        }
        return queries;
    }

    private static JSObject toRecord(Cursor cursor, JSONArray columns) throws Exception {
        JSObject record = new JSObject();
        for (int index = 0; index < columns.length(); index += 1) {
            JSONObject column = columns.getJSONObject(index);
            putColumn(record, cursor, column.getString("key"), column.getString("type"), cursor.getColumnIndexOrThrow(column.getString("source")));
        }
        return record;
    }

    private static void putColumn(JSObject record, Cursor cursor, String key, String type, int columnIndex) throws Exception {
        if (cursor.isNull(columnIndex)) {
            record.put(key, JSONObject.NULL);
            return;
        }
        if ("json".equals(type)) {
            record.put(key, new JSONObject(cursor.getString(columnIndex)));
            return;
        }
        if ("long".equals(type)) {
            record.put(key, cursor.getLong(columnIndex));
            return;
        }
        if ("double".equals(type)) {
            record.put(key, cursor.getDouble(columnIndex));
            return;
        }
        record.put(key, cursor.getString(columnIndex));
    }
}
