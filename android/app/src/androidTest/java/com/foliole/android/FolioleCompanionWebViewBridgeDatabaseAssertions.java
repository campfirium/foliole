package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionWebViewBridgeDatabaseAssertions {
    private FolioleCompanionWebViewBridgeDatabaseAssertions() {}

    static String selectNodeValue(Context context, String column) {
        try (
            SQLiteDatabase database = SQLiteDatabase.openDatabase(
                context.getDatabasePath(FolioleCompanionDatabaseHelper.DATABASE_NAME).getAbsolutePath(),
                null,
                SQLiteDatabase.OPEN_READONLY
            );
            Cursor cursor = database.rawQuery("SELECT " + column + " FROM nodes WHERE id = 'node-1'", null)
        ) {
            cursor.moveToFirst();
            return cursor.getString(0);
        }
    }
}
