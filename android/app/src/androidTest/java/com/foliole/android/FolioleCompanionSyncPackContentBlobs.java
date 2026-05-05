package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionSyncPackContentBlobs {
    private FolioleCompanionSyncPackContentBlobs() {}

    static int upsert(SQLiteDatabase database) {
        database.execSQL(
            "INSERT OR REPLACE INTO main.content_blobs (" +
                "hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
                "original_sha256, stored_sha256, availability, source_device_id, created_at, cached_at, last_verified_at) " +
                "SELECT incoming.hash, incoming.storage_key, incoming.kind, incoming.mime_type, incoming.compression, " +
                "incoming.original_size_bytes, incoming.stored_size_bytes, incoming.original_sha256, incoming.stored_sha256, " +
                "CASE WHEN data.hash IS NOT NULL THEN 'cached' ELSE 'missing' END, " +
                "incoming.source_device_id, incoming.created_at, " +
                "CASE WHEN data.hash IS NOT NULL THEN incoming.cached_at ELSE NULL END, " +
                "CASE WHEN data.hash IS NOT NULL THEN incoming.last_verified_at ELSE NULL END " +
                "FROM inc.content_blobs incoming " +
                "LEFT JOIN main.content_blob_data data ON data.hash = incoming.hash " +
                "WHERE incoming.hash IN (" +
                "SELECT body_blob_hash FROM inc.nodes WHERE body_blob_hash IS NOT NULL " +
                "AND id IN (SELECT object_id FROM " + FolioleCompanionSyncPackApplyableRows.sql("node") + ") " +
                "UNION SELECT body_blob_hash FROM inc.external_documents WHERE body_blob_hash IS NOT NULL " +
                "AND document_id IN (SELECT object_id FROM " +
                FolioleCompanionSyncPackApplyableRows.sql("external_document") + "))"
        );
        return changedRows(database);
    }

    private static int changedRows(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery("SELECT changes()", null)) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }
}
