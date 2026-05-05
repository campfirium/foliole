package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import java.util.Map;

import com.getcapacitor.JSArray;

import org.json.JSONObject;

final class FolioleCompanionGeneratedQueryRunner {
    private FolioleCompanionGeneratedQueryRunner() {}

    static JSObject load(Context context, SQLiteDatabase database, String queryName) throws Exception {
        return FolioleCompanionNamedQueryStore.loadArray(context, database, queryName);
    }

    static JSObject load(Context context, SQLiteDatabase database, String queryName, String[] args) throws Exception {
        return FolioleCompanionNamedQueryStore.loadArray(context, database, queryName, args);
    }

    static JSObject load(
        Context context,
        SQLiteDatabase database,
        String queryName,
        Map<String, String> replacements,
        String[] args
    ) throws Exception {
        return FolioleCompanionNamedQueryStore.loadArray(context, database, queryName, replacements, args);
    }

    static String loadString(Context context, SQLiteDatabase database, String queryName, String[] args) throws Exception {
        return FolioleCompanionNamedQueryStore.loadString(context, database, queryName, args);
    }

    static JSObject loadLongMetrics(Context context, SQLiteDatabase database, String queryName) throws Exception {
        return FolioleCompanionNamedQueryStore.loadLongMetrics(context, database, queryName);
    }

    static JSArray loadRows(Context context, SQLiteDatabase database, String queryName, String resultKey) throws Exception {
        return FolioleCompanionNamedQueryStore.loadRows(context, database, queryName, resultKey);
    }

    static JSArray loadRows(Context context, SQLiteDatabase database, String queryName, String resultKey, String[] args) throws Exception {
        return FolioleCompanionNamedQueryStore.loadRows(context, database, queryName, resultKey, args);
    }

    static JSArray loadRows(
        Context context,
        SQLiteDatabase database,
        String queryName,
        String resultKey,
        Map<String, String> replacements,
        String[] args
    ) throws Exception {
        return FolioleCompanionNamedQueryStore.loadRows(context, database, queryName, resultKey, replacements, args);
    }

    static JSONObject loadFirstRow(Context context, SQLiteDatabase database, String queryName, String resultKey, String[] args) throws Exception {
        return FolioleCompanionNamedQueryStore.loadFirstRow(context, database, queryName, resultKey, args);
    }

    static boolean hasRows(Context context, SQLiteDatabase database, String queryName, String resultKey, String[] args) throws Exception {
        return FolioleCompanionNamedQueryStore.hasRows(context, database, queryName, resultKey, args);
    }
}
