package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import java.util.Map;

final class FolioleCompanionGeneratedArrayQueryRunner {
    private FolioleCompanionGeneratedArrayQueryRunner() {}

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
}
