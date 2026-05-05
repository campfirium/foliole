package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

final class FolioleCompanionAttachmentSyncPayload {

    private FolioleCompanionAttachmentSyncPayload() {}

    static String readPayloadJson(SQLiteDatabase database, String objectId) throws Exception {
        String sql = "SELECT a.id, a.original_name, a.mime_type, a.size_bytes, a.created_at, " +
            "b.content_hash, b.storage_key, b.size_bytes, b.mime_type, b.availability, " +
            "b.source_device_id, b.created_at, b.cached_at, b.last_verified_at " +
            "FROM attachments a LEFT JOIN attachment_blobs b ON b.attachment_id = a.id WHERE a.id = ? LIMIT 1";
        try (Cursor cursor = database.rawQuery(sql, new String[] { objectId })) {
            if (!cursor.moveToFirst()) {
                return "{}";
            }
            JSONObject payload = new JSONObject();
            payload.put("attachment_id", cursor.getString(0));
            putNullable(payload, "original_name", cursor, 1);
            putNullable(payload, "mime_type", cursor, 2);
            putLongOrNull(payload, "size_bytes", cursor, 3);
            putNullable(payload, "created_at", cursor, 4);
            payload.put("blob", readBlobPayload(cursor));
            return payload.toString();
        }
    }

    private static JSONObject readBlobPayload(Cursor cursor) throws Exception {
        JSONObject blob = new JSONObject();
        putNullable(blob, "content_hash", cursor, 5);
        putNullable(blob, "storage_key", cursor, 6);
        putLongOrNull(blob, "size_bytes", cursor, 7);
        putNullable(blob, "mime_type", cursor, 8);
        putNullable(blob, "availability", cursor, 9);
        putNullable(blob, "source_device_id", cursor, 10);
        putNullable(blob, "created_at", cursor, 11);
        putNullable(blob, "cached_at", cursor, 12);
        putNullable(blob, "last_verified_at", cursor, 13);
        return blob;
    }

    private static void putNullable(JSONObject payload, String key, Cursor cursor, int columnIndex) throws Exception {
        payload.put(key, cursor.isNull(columnIndex) ? JSONObject.NULL : cursor.getString(columnIndex));
    }

    private static void putLongOrNull(JSONObject payload, String key, Cursor cursor, int columnIndex) throws Exception {
        if (cursor.isNull(columnIndex)) {
            payload.put(key, JSONObject.NULL);
        } else {
            payload.put(key, cursor.getLong(columnIndex));
        }
    }
}
