package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.security.MessageDigest;
import java.time.Instant;

final class FolioleCompanionContentBlobStore {
    private FolioleCompanionContentBlobStore() {}

    static JSObject loadMissingHashes(SQLiteDatabase database, int limit) {
        JSArray hashes = new JSArray();
        try (Cursor cursor = database.rawQuery(
            "SELECT cb.hash FROM content_blobs cb " +
                "LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash " +
                "WHERE cb.kind = 'text_body' AND cbd.hash IS NULL " +
                "AND (EXISTS (SELECT 1 FROM nodes n WHERE n.body_blob_hash = cb.hash) " +
                "OR EXISTS (SELECT 1 FROM external_documents ed WHERE ed.body_blob_hash = cb.hash)) " +
                "ORDER BY cb.created_at ASC LIMIT ?",
            new String[] { String.valueOf(Math.max(1, limit)) }
        )) {
            while (cursor.moveToNext()) {
                hashes.put(cursor.getString(0));
            }
        }
        JSObject result = new JSObject();
        result.put("hashes", hashes);
        return result;
    }

    static JSObject syncBlob(SQLiteDatabase database, String hash, String url, JSONObject headers) throws Exception {
        String normalizedHash = requireHash(hash);
        if (hasCachedBlobData(database, normalizedHash)) {
            return markCached(database, normalizedHash);
        }
        byte[] bytes = FolioleCompanionDesktopHttpClient.requestBytes(requireText(url, "url"), headers);
        String actualHash = sha256(bytes);
        if (!normalizedHash.equals(actualHash)) {
            throw new IllegalStateException("Content blob hash mismatch.");
        }
        String now = Instant.now().toString();
        database.beginTransaction();
        try {
            ContentValues data = new ContentValues();
            data.put("hash", normalizedHash);
            data.put("data", bytes);
            database.insertWithOnConflict("content_blob_data", null, data, SQLiteDatabase.CONFLICT_REPLACE);

            ContentValues manifest = new ContentValues();
            manifest.put("availability", "cached");
            manifest.put("cached_at", now);
            manifest.put("last_verified_at", now);
            int updated = database.update("content_blobs", manifest, "hash = ?", new String[] { normalizedHash });
            if (updated <= 0) {
                throw new IllegalStateException("Content blob manifest is missing.");
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
        JSObject result = new JSObject();
        result.put("hash", normalizedHash);
        result.put("availability", "cached");
        return result;
    }

    private static boolean hasCachedBlobData(SQLiteDatabase database, String hash) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM content_blob_data WHERE hash = ? LIMIT 1",
            new String[] { hash }
        )) {
            return cursor.moveToFirst();
        }
    }

    private static JSObject markCached(SQLiteDatabase database, String hash) {
        String now = Instant.now().toString();
        ContentValues manifest = new ContentValues();
        manifest.put("availability", "cached");
        manifest.put("cached_at", now);
        manifest.put("last_verified_at", now);
        int updated = database.update("content_blobs", manifest, "hash = ?", new String[] { hash });
        if (updated <= 0) {
            throw new IllegalStateException("Content blob manifest is missing.");
        }
        JSObject result = new JSObject();
        result.put("hash", hash);
        result.put("availability", "cached");
        return result;
    }

    private static String requireHash(String value) {
        String hash = requireText(value, "hash").toLowerCase();
        if (!hash.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("hash is invalid.");
        }
        return hash;
    }

    private static String requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return value.trim();
    }

    private static String sha256(byte[] bytes) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(bytes);
        StringBuilder builder = new StringBuilder();
        for (byte value : hash) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }
}
