package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionSqliteRuntime {
    private FolioleCompanionSqliteRuntime() {}

    static boolean tableExists(SQLiteDatabase database, String tableName) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            new String[] { tableName }
        )) {
            return cursor.moveToFirst();
        }
    }

    static boolean columnExists(SQLiteDatabase database, String tableName, String columnName) {
        try (Cursor cursor = database.rawQuery("PRAGMA table_info(" + tableName + ")", null)) {
            while (cursor.moveToNext()) {
                if (columnName.equals(cursor.getString(cursor.getColumnIndexOrThrow("name")))) {
                    return true;
                }
            }
        }
        return false;
    }
}
