package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import java.io.File;
import java.nio.file.Files;

final class FolioleCompanionSyncGroupResources {
    private FolioleCompanionSyncGroupResources() {}

    static Resource contentBlob(String databasePath, String hash) {
        if (hash == null || !hash.matches("[a-fA-F0-9]{64}")) return null;
        SQLiteDatabase db = SQLiteDatabase.openDatabase(databasePath, null, SQLiteDatabase.OPEN_READONLY);
        try (Cursor cursor = db.rawQuery(
            "SELECT cb.mime_type, cbd.data FROM content_blobs cb JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cb.hash = ?",
            new String[] { hash.toLowerCase() })) {
            if (!cursor.moveToFirst()) return null;
            return new Resource(cursor.isNull(0) ? "application/octet-stream" : cursor.getString(0), cursor.getBlob(1));
        } finally { db.close(); }
    }

    static Resource attachment(Context context, String databasePath, String attachmentId, String contentHash) throws Exception {
        if (attachmentId == null || attachmentId.trim().isEmpty() || contentHash == null || contentHash.trim().isEmpty()) return null;
        SQLiteDatabase db = SQLiteDatabase.openDatabase(databasePath, null, SQLiteDatabase.OPEN_READONLY);
        try (Cursor cursor = db.rawQuery(
            "SELECT content_hash, storage_key, mime_type FROM attachment_blobs WHERE attachment_id = ?",
            new String[] { attachmentId })) {
            if (!cursor.moveToFirst() || !contentHash.matches("[a-f0-9]{64}") || !contentHash.equals(cursor.getString(0)) ||
                cursor.isNull(1) || !contentHash.equals(cursor.getString(1))) return null;
            File file = new File(new File(context.getFilesDir(), "attachments"), contentHash);
            if (!file.isFile()) return null;
            return new Resource(cursor.isNull(2) ? "application/octet-stream" : cursor.getString(2), Files.readAllBytes(file.toPath()));
        } finally { db.close(); }
    }

    static final class Resource {
        final byte[] body;
        final String mimeType;
        Resource(String mimeType, byte[] body) { this.mimeType = mimeType; this.body = body; }
    }
}
