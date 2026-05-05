package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

final class FolioleCompanionSyncDiagnosticStorage {
    private FolioleCompanionSyncDiagnosticStorage() {}

    static JSObject load(Context context, SQLiteDatabase database) throws Exception {
        return FolioleCompanionNamedQueryStore.loadLongMetrics(context, database, "diagnosticStorageMetrics");
    }
}
