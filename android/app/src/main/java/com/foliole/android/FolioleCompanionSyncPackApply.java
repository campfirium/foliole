package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import java.io.File;

final class FolioleCompanionSyncPackApply {
    private static final String INCOMING_ALIAS = "inc";

    private FolioleCompanionSyncPackApply() {}

    static JSObject applyPack(SQLiteDatabase database, File packFile, String deviceId) throws Exception {
        if (packFile == null || !packFile.isFile()) {
            throw new IllegalArgumentException("Invalid sync pack file.");
        }
        attachIncoming(database, packFile);
        int appliedObjects = 0;
        int appliedBlobs = 0;
        try {
            database.beginTransaction();
            try {
                requirePackManifest(database);
                appliedBlobs = upsertContentBlobs(database);
                upsertNodes(database);
                upsertExternalDocuments(database);
                appliedObjects = upsertStateRows(database, deviceId);
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
        } finally {
            detachIncoming(database);
        }
        JSObject result = new JSObject();
        result.put("applied_object_count", appliedObjects);
        result.put("applied_blob_count", appliedBlobs);
        return result;
    }

    private static void attachIncoming(SQLiteDatabase database, File packFile) {
        database.execSQL("ATTACH DATABASE " + sqlString(packFile.getAbsolutePath()) + " AS " + INCOMING_ALIAS);
    }

    private static void detachIncoming(SQLiteDatabase database) {
        database.execSQL("DETACH DATABASE " + INCOMING_ALIAS);
    }

    private static void requirePackManifest(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery(
            "SELECT value FROM inc.pack_manifest WHERE key = 'manifest_json'",
            null
        )) {
            if (!cursor.moveToFirst() || cursor.getString(0).trim().isEmpty()) {
                throw new IllegalArgumentException("Invalid sync pack manifest.");
            }
        }
    }

    private static int upsertContentBlobs(SQLiteDatabase database) {
        database.execSQL(
            "INSERT OR REPLACE INTO main.content_blobs (" +
                "hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
                "original_sha256, stored_sha256, availability, source_device_id, created_at, cached_at, last_verified_at) " +
                "SELECT hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
                "original_sha256, stored_sha256, availability, source_device_id, created_at, cached_at, last_verified_at " +
                "FROM inc.content_blobs"
        );
        return changedRows(database);
    }

    private static void upsertNodes(SQLiteDatabase database) {
        database.execSQL(
            "INSERT OR REPLACE INTO main.nodes (" +
                "id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash, " +
                "content, created_at, updated_at, deleted_at) " +
                "SELECT id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash, " +
                "content, created_at, updated_at, deleted_at FROM inc.nodes"
        );
    }

    private static void upsertExternalDocuments(SQLiteDatabase database) {
        database.execSQL(
            "INSERT OR REPLACE INTO main.external_documents (" +
                "document_id, folder_id, relative_path, file_name, extension, source_size_bytes, " +
                "source_modified_at, source_modified_ms, content_hash, title, opening_text, body_blob_hash, " +
                "content, indexed_at, is_present, missing_at, created_at, updated_at) " +
                "SELECT document_id, folder_id, relative_path, file_name, extension, source_size_bytes, " +
                "source_modified_at, source_modified_ms, content_hash, title, opening_text, body_blob_hash, " +
                "content, indexed_at, is_present, missing_at, created_at, updated_at FROM inc.external_documents"
        );
    }

    private static int upsertStateRows(SQLiteDatabase database, String deviceId) {
        int count = 0;
        try (Cursor cursor = database.rawQuery(
            "SELECT object_type, object_id, content_hash, updated_at, deleted_at FROM inc.sync_object_state " +
                "ORDER BY state_seq ASC",
            null
        )) {
            while (cursor.moveToNext()) {
                FolioleCompanionSyncStateRows.upsert(
                    database,
                    cursor.getString(0),
                    cursor.getString(1),
                    null,
                    cursor.getString(2),
                    deviceId,
                    cursor.getString(3),
                    cursor.isNull(4) ? null : cursor.getString(4),
                    0
                );
                count += 1;
            }
        }
        return count;
    }

    private static int changedRows(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery("SELECT changes()", null)) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }

    private static String sqlString(String value) {
        return "'" + value.replace("'", "''") + "'";
    }
}
