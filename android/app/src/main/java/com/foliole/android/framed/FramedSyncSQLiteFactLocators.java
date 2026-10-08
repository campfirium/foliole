package com.foliole.android.framed;

import android.database.sqlite.SQLiteDatabase;

final class FramedSyncSQLiteFactLocators {
    private FramedSyncSQLiteFactLocators() {}

    static void upgrade(SQLiteDatabase database) {
        if (database.getVersion() >= 2) return;
        database.beginTransaction();
        try {
            database.execSQL("ALTER TABLE framed_sync_android_facts ADD COLUMN first_sequence TEXT");
            database.execSQL("ALTER TABLE framed_sync_android_facts ADD COLUMN last_sequence TEXT");
            database.setVersion(2);
            database.setTransactionSuccessful();
        } finally { database.endTransaction(); }
    }
}
