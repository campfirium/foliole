package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionNamedQueryStore {
    private static final String QUERY_ASSET_PATH = "companion-query-definitions.json";

    private FolioleCompanionNamedQueryStore() {}

    static JSObject loadArray(Context context, SQLiteDatabase database, String queryName) throws Exception {
        return loadArray(context, database, queryName, null);
    }

    static JSObject loadArray(Context context, SQLiteDatabase database, String queryName, String[] args) throws Exception {
        JSONObject query = loadQuery(context, queryName);
        String resultKey = query.getString("resultKey");
        String sql = query.getString("sql");
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

    private static JSONObject loadQuery(Context context, String queryName) throws Exception {
        JSONObject payload = new JSONObject(FolioleCompanionAssetReader.read(context, QUERY_ASSET_PATH));
        JSONObject queries = payload.optJSONObject("queries");
        if (queries == null) {
            throw new IllegalStateException("Companion query definitions asset is missing queries.");
        }
        JSONObject query = queries.optJSONObject(queryName);
        if (query == null) {
            throw new IllegalStateException("Companion query definitions asset is missing query: " + queryName);
        }
        return query;
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
        record.put(key, cursor.getString(columnIndex));
    }
}
