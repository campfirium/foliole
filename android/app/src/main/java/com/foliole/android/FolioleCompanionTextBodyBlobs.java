package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class FolioleCompanionTextBodyBlobs {

    private FolioleCompanionTextBodyBlobs() {}

    static String upsert(Context context, SQLiteDatabase database, String content, String now) throws Exception {
        if (!tableExists(database, "content_blobs") || !tableExists(database, "content_blob_data")) {
            return null;
        }
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        String hash = sha256(bytes);
        FolioleCompanionNamedMutationStore.execute(context, database, "textBodyBlobManifestInsert", new Object[] {
            hash,
            "text/" + hash,
            "text_body",
            "text/plain",
            "none",
            bytes.length,
            bytes.length,
            hash,
            hash,
            "local",
            now,
            now,
            now
        });
        FolioleCompanionNamedMutationStore.execute(context, database, "textBodyBlobDataInsert", new Object[] { hash, bytes });
        return hash;
    }

    private static boolean tableExists(SQLiteDatabase database, String tableName) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            new String[] { tableName }
        )) {
            return cursor.moveToFirst();
        }
    }

    private static String sha256(byte[] bytes) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder builder = new StringBuilder();
        for (byte value : hash) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }
}
