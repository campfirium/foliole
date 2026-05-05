package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncDiagnosticStorage {
    private FolioleCompanionSyncDiagnosticStorage() {}

    static JSObject load(Context context, SQLiteDatabase database) throws Exception {
        JSObject storage = new JSObject();
        JSONArray metrics = FolioleCompanionNamedQueryStore.loadArray(context, database, "diagnosticStorageMetrics").getJSONArray("metrics");
        for (int index = 0; index < metrics.length(); index += 1) {
            JSONObject metric = metrics.getJSONObject(index);
            storage.put(metric.getString("metric"), metric.getLong("value"));
        }
        return storage;
    }
}
