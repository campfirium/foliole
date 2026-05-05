package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.File;

final class FolioleCompanionSyncPackApply {
    private static final String INCOMING_ALIAS = "inc";

    private FolioleCompanionSyncPackApply() {}

    static JSObject applyPack(SQLiteDatabase database, File packFile, String deviceId) throws Exception {
        return applyPack(database, packFile, deviceId, 0);
    }

    static JSObject applyPack(SQLiteDatabase database, File packFile, String deviceId, int currentCursor) throws Exception {
        if (packFile == null || !packFile.isFile()) {
            throw new IllegalArgumentException("Invalid sync pack file.");
        }
        int appliedObjects = 0;
        int appliedBlobs = 0;
        int toStateSeq = 0;
        JSArray appliedReviewOpIds = new JSArray();
        boolean attached = false;
        FolioleCompanionSyncPackContainer.PreparedPack preparedPack =
            FolioleCompanionSyncPackContainer.prepare(packFile);
        try {
            attachIncoming(database, preparedPack.incomingFile);
            attached = true;
            database.beginTransaction();
            try {
                PackCursor packCursor = readPackCursor(database);
                toStateSeq = packCursor.toStateSeq;
                if (packCursor.toStateSeq > currentCursor) {
                    if (packCursor.fromStateSeq != currentCursor) {
                        throw new IllegalArgumentException("Sync pack cursor is not contiguous.");
                    }
                    appliedBlobs = upsertContentBlobs(database);
                    upsertNodes(database);
                    replaceNodeAttachments(database);
                    upsertExternalDocuments(database);
                    upsertSyncObjects(database, deviceId);
                    appliedReviewOpIds = applyReviewLog(database);
                    appliedObjects = upsertStateRows(database, deviceId);
                    clearConfirmedPushAcks(database);
                }
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
        } finally {
            if (attached) {
                detachIncoming(database);
            }
            preparedPack.close();
        }
        JSObject result = new JSObject();
        result.put("applied_object_count", appliedObjects);
        result.put("applied_blob_count", appliedBlobs);
        result.put("applied_review_op_ids", appliedReviewOpIds);
        result.put("to_state_seq", toStateSeq);
        return result;
    }

    private static void attachIncoming(SQLiteDatabase database, File packFile) {
        database.execSQL("ATTACH DATABASE " + sqlString(packFile.getAbsolutePath()) + " AS " + INCOMING_ALIAS);
    }

    private static void detachIncoming(SQLiteDatabase database) {
        database.execSQL("DETACH DATABASE " + INCOMING_ALIAS);
    }

    private static PackCursor readPackCursor(SQLiteDatabase database) throws Exception {
        try (Cursor cursor = database.rawQuery(
            "SELECT value FROM inc.pack_manifest WHERE key = 'manifest_json'",
            null
        )) {
            if (!cursor.moveToFirst() || cursor.getString(0).trim().isEmpty()) {
                throw new IllegalArgumentException("Invalid sync pack manifest.");
            }
            JSONObject manifest = new JSONObject(cursor.getString(0));
            return new PackCursor(
                Math.max(0, manifest.optInt("from_state_seq", 0)),
                Math.max(0, manifest.optInt("to_state_seq", 0))
            );
        }
    }

    private static int upsertContentBlobs(SQLiteDatabase database) {
        database.execSQL(
            "INSERT OR REPLACE INTO main.content_blobs (" +
                "hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
                "original_sha256, stored_sha256, availability, source_device_id, created_at, cached_at, last_verified_at) " +
                "SELECT hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, " +
                "original_sha256, stored_sha256, " +
                "CASE WHEN EXISTS (SELECT 1 FROM main.content_blob_data data WHERE data.hash = incoming.hash) " +
                "THEN 'cached' ELSE 'missing' END, " +
                "source_device_id, created_at, " +
                "CASE WHEN EXISTS (SELECT 1 FROM main.content_blob_data data WHERE data.hash = incoming.hash) " +
                "THEN incoming.cached_at ELSE NULL END, " +
                "CASE WHEN EXISTS (SELECT 1 FROM main.content_blob_data data WHERE data.hash = incoming.hash) " +
                "THEN incoming.last_verified_at ELSE NULL END " +
                "FROM inc.content_blobs incoming WHERE incoming.hash IN (" +
                "SELECT body_blob_hash FROM inc.nodes WHERE body_blob_hash IS NOT NULL " +
                "AND id IN (SELECT object_id FROM " + applyableStateRowsSql("node") + ") " +
                "UNION SELECT body_blob_hash FROM inc.external_documents WHERE body_blob_hash IS NOT NULL " +
                "AND document_id IN (SELECT object_id FROM " + applyableStateRowsSql("external_document") + "))"
        );
        return changedRows(database);
    }

    private static void upsertNodes(SQLiteDatabase database) {
        database.execSQL(
            "INSERT OR REPLACE INTO main.nodes (" +
                "id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash, " +
                "opening_text, content, created_at, updated_at, deleted_at) " +
                "SELECT id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash, " +
                "opening_text, content, created_at, updated_at, deleted_at FROM inc.nodes " +
                "WHERE id IN (SELECT object_id FROM " + applyableStateRowsSql("node") + ")"
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
                "content, indexed_at, is_present, missing_at, created_at, updated_at FROM inc.external_documents " +
                "WHERE document_id IN (SELECT object_id FROM " + applyableStateRowsSql("external_document") + ")"
        );
    }

    private static void replaceNodeAttachments(SQLiteDatabase database) {
        database.execSQL(
            "DELETE FROM main.node_attachments WHERE node_id IN (" +
                "SELECT object_id FROM " + applyableStateRowsSql("node") + ")"
        );
        database.execSQL(
            "INSERT OR REPLACE INTO main.node_attachments (node_id, attachment_id, role) " +
                "SELECT node_id, attachment_id, role FROM inc.node_attachments " +
                "WHERE node_id IN (SELECT object_id FROM " + applyableStateRowsSql("node") + ")"
        );
    }

    private static void upsertSyncObjects(SQLiteDatabase database, String deviceId) throws Exception {
        try (Cursor cursor = database.rawQuery(
            "SELECT object_type, object_id, content_hash, payload_json, updated_at, deleted_at FROM inc.sync_objects incoming " +
                "WHERE EXISTS (SELECT 1 FROM " + applyableStateRowsSql(null) + " state " +
                "WHERE state.object_type = incoming.object_type AND state.object_id = incoming.object_id) " +
                "ORDER BY updated_at ASC, object_type ASC, object_id ASC",
            null
        )) {
            while (cursor.moveToNext()) {
                JSONObject record = new JSONObject();
                record.put("object_type", cursor.getString(0));
                record.put("object_id", cursor.getString(1));
                record.put("content_hash", cursor.getString(2));
                record.put("payload_json", cursor.isNull(3) ? JSONObject.NULL : cursor.getString(3));
                record.put("updated_at", cursor.getString(4));
                record.put("deleted_at", cursor.isNull(5) ? JSONObject.NULL : cursor.getString(5));
                if (isConsumableSyncObject(cursor.getString(0), cursor.getString(1), deviceId)) {
                    FolioleCompanionSyncObjectApply.applyPayload(database, record);
                }
            }
        }
    }

    private static JSArray applyReviewLog(SQLiteDatabase database) throws Exception {
        JSArray reviews = new JSArray();
        if (!incomingTableExists(database, "review_log")) {
            return reviews;
        }
        try (Cursor cursor = database.rawQuery(
            "SELECT id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at, " +
                "due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after " +
                "FROM inc.review_log ORDER BY reviewed_at ASC, op_id ASC",
            null
        )) {
            while (cursor.moveToNext()) {
                JSONObject review = new JSONObject();
                review.put("id", cursor.getString(0));
                review.put("op_id", cursor.getString(1));
                review.put("device_id", cursor.getString(2));
                review.put("node_id", cursor.getString(3));
                review.put("grade", cursor.getInt(4));
                review.put("scheduler_version", cursor.getString(5));
                review.put("reviewed_at", cursor.getString(6));
                review.put("due_before", cursor.getString(7));
                review.put("stability_before", cursor.getDouble(8));
                review.put("difficulty_before", cursor.getDouble(9));
                review.put("due_after", cursor.getString(10));
                review.put("stability_after", cursor.getDouble(11));
                review.put("difficulty_after", cursor.getDouble(12));
                reviews.put(review);
            }
        }
        return FolioleCompanionSyncReviewLogStore.applyAndConfirmReviewLogRows(database, reviews);
    }

    private static boolean incomingTableExists(SQLiteDatabase database, String tableName) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM inc.sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            new String[] { tableName }
        )) {
            return cursor.moveToFirst();
        }
    }

    private static int upsertStateRows(SQLiteDatabase database, String deviceId) {
        int count = 0;
        try (Cursor cursor = database.rawQuery(
                "SELECT object_type, object_id, content_hash, updated_at, deleted_at FROM " +
                applyableStateRowsSql(null) + " WHERE object_type IN (" +
                "'attachment', 'external_folder', 'import_source', 'node', 'external_document', " +
                "'node_reading', 'node_review', 'setting', 'view_state') ORDER BY state_seq ASC",
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

    private static boolean isConsumableSyncObject(String objectType, String objectId, String deviceId) {
        if (!objectType.equals("view_state")) {
            return true;
        }
        String[] parts = objectId.split(":", 5);
        return parts.length == 5 && parts[1].equals("android") && parts[3].equals(deviceId);
    }

    private static void clearConfirmedPushAcks(SQLiteDatabase database) {
        database.execSQL(
            "UPDATE sync_object_state SET sync_dirty = 0, base_content_hash = NULL " +
                "WHERE sync_dirty = 1 AND EXISTS (" +
                "SELECT 1 FROM sync_push_ack ack JOIN inc.sync_object_state incoming " +
                "ON incoming.object_type = ack.object_type AND incoming.object_id = ack.object_id " +
                "WHERE ack.object_type = sync_object_state.object_type " +
                "AND ack.object_id = sync_object_state.object_id " +
                "AND ack.state_seq IS NOT NULL " +
                "AND incoming.state_seq >= ack.state_seq " +
                "AND incoming.content_hash = sync_object_state.content_hash)"
        );
        database.execSQL(
            "DELETE FROM sync_push_ack WHERE EXISTS (" +
                "SELECT 1 FROM sync_object_state state WHERE state.object_type = sync_push_ack.object_type " +
                "AND state.object_id = sync_push_ack.object_id AND state.sync_dirty = 0)"
        );
    }

    private static String applyableStateRowsSql(String objectType) {
        String typeFilter = objectType == null ? "" : " AND incoming.object_type = '" + objectType + "'";
        return "(SELECT incoming.object_type, incoming.object_id, incoming.state_seq, incoming.content_hash, " +
            "incoming.updated_at, incoming.deleted_at FROM inc.sync_object_state incoming " +
            "LEFT JOIN main.sync_object_state current ON current.object_type = incoming.object_type " +
            "AND current.object_id = incoming.object_id WHERE " +
            "(current.object_id IS NULL OR (current.updated_at <= incoming.updated_at " +
            "AND (current.sync_dirty <> 1 OR EXISTS (" +
            "SELECT 1 FROM main.sync_push_ack ack WHERE ack.object_type = incoming.object_type " +
            "AND ack.object_id = incoming.object_id AND ack.state_seq IS NOT NULL " +
            "AND incoming.state_seq >= ack.state_seq AND incoming.content_hash = current.content_hash))))" +
            typeFilter + ")";
    }

    private static int changedRows(SQLiteDatabase database) {
        try (Cursor cursor = database.rawQuery("SELECT changes()", null)) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }

    private static String sqlString(String value) {
        return "'" + value.replace("'", "''") + "'";
    }

    private static final class PackCursor {
        final int fromStateSeq;
        final int toStateSeq;

        PackCursor(int fromStateSeq, int toStateSeq) {
            this.fromStateSeq = fromStateSeq;
            this.toStateSeq = toStateSeq;
        }
    }
}
