package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

final class FolioleCompanionContentBlobPack {
    private static final String TABLE = "content_blob_batch";

    private FolioleCompanionContentBlobPack() {}

    static File create(Context context, List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs) throws Exception {
        File root = new File(context.getCacheDir(), "foliole-content-packs");
        if (!root.exists() && !root.mkdirs()) throw new IllegalStateException("Failed to create content pack directory.");
        File pack = new File(root, UUID.randomUUID() + ".db");
        SQLiteDatabase database = SQLiteDatabase.openOrCreateDatabase(pack, null);
        try {
            database.execSQL("CREATE TABLE " + TABLE + " (hash TEXT PRIMARY KEY, size_bytes INTEGER NOT NULL, data BLOB NOT NULL)");
            database.beginTransaction();
            try {
                for (FolioleCompanionContentBlobMultipartBatch.Blob blob : blobs) {
                    database.execSQL("INSERT INTO " + TABLE + " VALUES (?, ?, ?)", new Object[] {
                        blob.hash, blob.bytes.length, blob.bytes
                    });
                }
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
            assertIntegrity(database, blobs.size());
            return pack;
        } catch (Exception error) {
            pack.delete();
            throw error;
        } finally {
            database.close();
        }
    }

    static List<FolioleCompanionContentBlobMultipartBatch.Blob> read(File pack) {
        List<FolioleCompanionContentBlobMultipartBatch.Blob> blobs = new ArrayList<>();
        SQLiteDatabase database = SQLiteDatabase.openDatabase(pack.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
        try (Cursor cursor = database.rawQuery("SELECT hash, data FROM " + TABLE + " ORDER BY hash", null)) {
            while (cursor.moveToNext()) {
                blobs.add(new FolioleCompanionContentBlobMultipartBatch.Blob(cursor.getString(0), cursor.getBlob(1)));
            }
        } finally {
            database.close();
        }
        return blobs;
    }

    static void delete(File pack) {
        if (pack != null && pack.exists() && !pack.delete()) pack.deleteOnExit();
    }

    private static void assertIntegrity(SQLiteDatabase database, int expectedRows) {
        try (Cursor integrity = database.rawQuery("PRAGMA quick_check", null);
             Cursor count = database.rawQuery("SELECT COUNT(*) FROM " + TABLE, null)) {
            if (!integrity.moveToFirst() || !"ok".equals(integrity.getString(0))) {
                throw new IllegalStateException("Content pack failed SQLite integrity check.");
            }
            if (!count.moveToFirst() || count.getInt(0) != expectedRows) {
                throw new IllegalStateException("Content pack row count is invalid.");
            }
        }
    }
}
