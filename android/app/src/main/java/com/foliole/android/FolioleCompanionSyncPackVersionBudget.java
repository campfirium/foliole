package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionSyncPackVersionBudget {
    private FolioleCompanionSyncPackVersionBudget() {}

    static boolean exceeds(FolioleCompanionSyncPackProviderDefinitions definitions,
                           String snapshotPath, int fromSeq, int toSeq) throws Exception {
        SQLiteDatabase source = SQLiteDatabase.openDatabase(snapshotPath, null, SQLiteDatabase.OPEN_READONLY);
        try (Cursor cursor = source.rawQuery(definitions.versionPreflightSql(),
            new String[] { String.valueOf(fromSeq), String.valueOf(toSeq),
                String.valueOf(fromSeq), String.valueOf(toSeq) })) {
            return cursor.moveToFirst() && (cursor.getLong(0) > 128 || cursor.getLong(1) > 4L * 1024 * 1024);
        } finally { source.close(); }
    }
}
