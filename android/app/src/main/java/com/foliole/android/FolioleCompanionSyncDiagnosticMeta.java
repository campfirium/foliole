package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionSyncDiagnosticMeta {
    private FolioleCompanionSyncDiagnosticMeta() {}

    static String load(Context context, SQLiteDatabase database, String key) throws Exception {
        String value = FolioleCompanionGeneratedQueryRunner.loadString(
            context,
            database,
            FolioleCompanionSyncDiagnosticQueryRules.queryName(context, "metaValue"),
            new String[] { key }
        );
        return value == null || value.trim().isEmpty() ? null : value;
    }
}
