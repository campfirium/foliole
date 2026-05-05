package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionSyncDiagnosticMeta {
    private FolioleCompanionSyncDiagnosticMeta() {}

    static String load(SQLiteDatabase database, String key) {
        try (Cursor cursor = database.rawQuery(
            "SELECT value FROM companion_meta WHERE key = ? LIMIT 1",
            new String[] { key }
        )) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            String value = cursor.getString(0);
            return value == null || value.trim().isEmpty() ? null : value;
        }
    }
}
