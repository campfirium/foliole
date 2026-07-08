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
                FolioleCompanionSyncPackCursor packCursor = readPackCursor(database);
                toStateSeq = packCursor.toStateSeq;
                if (packCursor.toStateSeq > currentCursor) {
                    if (packCursor.fromStateSeq != currentCursor) {
                        throw new IllegalArgumentException("Sync pack cursor is not contiguous.");
                    }
                    appliedBlobs = FolioleCompanionSyncPackContentBlobs.upsert(database);
                    upsertNodes(database);
                    FolioleCompanionSyncPackApplyExtras.replaceNodeOrder(database);
                    replaceNodeAttachments(database);
                    upsertExternalDocuments(database);
                    upsertSyncObjects(database, deviceId);
                    appliedReviewOpIds = FolioleCompanionSyncPackApplyExtras.applyReviewLog(database);
                    appliedObjects = upsertStateRows(database, deviceId);
                }
                clearConfirmedPushAcks(database);
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

    private static FolioleCompanionSyncPackCursor readPackCursor(SQLiteDatabase database) throws Exception {
        try (Cursor cursor = database.rawQuery(
            "SELECT value FROM inc.pack_manifest WHERE key = 'manifest_json'",
            null
        )) {
            if (!cursor.moveToFirst() || cursor.getString(0).trim().isEmpty()) {
                throw new IllegalArgumentException("Invalid sync pack manifest.");
            }
            JSONObject manifest = new JSONObject(cursor.getString(0));
            return new FolioleCompanionSyncPackCursor(
                Math.max(0, manifest.optInt("from_state_seq", 0)),
                Math.max(0, manifest.optInt("to_state_seq", 0))
            );
        }
    }

    private static void upsertNodes(SQLiteDatabase database) {
        String incomingCurrentVersionId = incomingColumnExists(database, "nodes", "current_version_id")
            ? "current_version_id"
            : "(SELECT existing.current_version_id FROM main.nodes existing WHERE existing.id = inc.nodes.id)";
        database.execSQL(
            "INSERT OR REPLACE INTO main.nodes (" +
                "id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash, " +
                "opening_text, content, current_version_id, created_at, updated_at, deleted_at) " +
                "SELECT id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash, " +
                "opening_text, content, " + incomingCurrentVersionId + ", created_at, updated_at, deleted_at FROM inc.nodes " +
                "WHERE id IN (SELECT object_id FROM " + FolioleCompanionSyncPackApplyableRows.sql("node") + ")"
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
                "WHERE document_id IN (SELECT object_id FROM " + FolioleCompanionSyncPackApplyableRows.sql("external_document") + ")"
        );
    }

    private static void replaceNodeAttachments(SQLiteDatabase database) {
        database.execSQL(
            "DELETE FROM main.node_attachments WHERE node_id IN (" +
                "SELECT object_id FROM " + FolioleCompanionSyncPackApplyableRows.sql("node") + ")"
        );
        database.execSQL(
            "INSERT OR REPLACE INTO main.node_attachments (node_id, attachment_id, role) " +
                "SELECT node_id, attachment_id, role FROM inc.node_attachments " +
                "WHERE node_id IN (SELECT object_id FROM " + FolioleCompanionSyncPackApplyableRows.sql("node") + ")"
        );
    }

    private static void upsertSyncObjects(SQLiteDatabase database, String deviceId) throws Exception {
        try (Cursor cursor = database.rawQuery(
            "SELECT object_type, object_id, content_hash, payload_json, updated_at, deleted_at FROM inc.sync_objects incoming " +
                "WHERE EXISTS (SELECT 1 FROM " + FolioleCompanionSyncPackApplyableRows.sql(null) + " state " +
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

    private static boolean incomingColumnExists(SQLiteDatabase database, String tableName, String columnName) {
        try (Cursor cursor = database.rawQuery("PRAGMA inc.table_info(" + tableName + ")", null)) {
            while (cursor.moveToNext()) {
                if (columnName.equals(cursor.getString(1))) {
                    return true;
                }
            }
        }
        return false;
    }

    private static int upsertStateRows(SQLiteDatabase database, String deviceId) {
        return FolioleCompanionSyncPackStateRows.upsert(database, deviceId, FolioleCompanionSyncPackApplyableRows.sql(null));
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

    private static String sqlString(String value) {
        return "'" + value.replace("'", "''") + "'";
    }

}
