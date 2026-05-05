package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import java.io.File;
import java.time.Instant;

final class FolioleCompanionAppDataStore {
    private static final ClearMutation[] CLEAR_MUTATIONS = {
        new ClearMutation("sync_push_ack", "appDataClearSyncPushAck"),
        new ClearMutation("sync_peer_cursors", "appDataClearSyncPeerCursors"),
        new ClearMutation("sync_change_log", "appDataClearSyncChangeLog"),
        new ClearMutation("sync_object_state", "appDataClearSyncObjectState"),
        new ClearMutation("node_sync_conflicts", "appDataClearNodeSyncConflicts"),
        new ClearMutation("node_sync_versions", "appDataClearNodeSyncVersions"),
        new ClearMutation("node_view_state", "appDataClearNodeViewState"),
        new ClearMutation("node_reading_device_state", "appDataClearNodeReadingDeviceState"),
        new ClearMutation("node_order", "appDataClearNodeOrder"),
        new ClearMutation("node_attachments", "appDataClearNodeAttachments"),
        new ClearMutation("attachment_blobs", "appDataClearAttachmentBlobs"),
        new ClearMutation("attachments", "appDataClearAttachments"),
        new ClearMutation("pdf_page_text", "appDataClearPdfPageText"),
        new ClearMutation("content_blob_data", "appDataClearContentBlobData"),
        new ClearMutation("content_blobs", "appDataClearContentBlobs"),
        new ClearMutation("external_documents", "appDataClearExternalDocuments"),
        new ClearMutation("external_search_folders", "appDataClearExternalSearchFolders"),
        new ClearMutation("import_sources", "appDataClearImportSources"),
        new ClearMutation("review_log", "appDataClearReviewLog"),
        new ClearMutation("node_reading", "appDataClearNodeReading"),
        new ClearMutation("node_review", "appDataClearNodeReview"),
        new ClearMutation("setting_records", "appDataClearSettingRecords"),
        new ClearMutation("nodes", "appDataClearNodes"),
        new ClearMutation("workspace_meta", "appDataClearWorkspaceMeta")
    };

    private FolioleCompanionAppDataStore() {}

    static JSObject clear(Context context) throws Exception {
        FolioleCompanionPairingStore.clearPairingCredentials(context);
        try (FolioleCompanionDatabaseHelper helper = new FolioleCompanionDatabaseHelper(context)) {
            SQLiteDatabase database = helper.getWritableDatabase();
            String now = Instant.now().toString();
            FolioleCompanionMetaRecords.loadOrCreateDeviceId(context, database, now);
            database.beginTransaction();
            try {
                clearTables(context, database);
                FolioleCompanionNamedMutationStore.execute(context, database, "companionMetaDeleteExceptDeviceId", null);
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
            deleteRecursively(new File(context.getFilesDir(), "attachments"));
            return FolioleCompanionSyncMetaStore.loadWorkspaceSyncState(context, database);
        }
    }

    private static void clearTables(Context context, SQLiteDatabase database) throws Exception {
        for (ClearMutation mutation : CLEAR_MUTATIONS) {
            if (FolioleCompanionSqliteRuntime.tableExists(database, mutation.table)) {
                FolioleCompanionNamedMutationStore.execute(context, database, mutation.statementName, null);
            }
        }
    }

    private static void deleteRecursively(File file) {
        if (!file.exists()) {
            return;
        }
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }
        if (!file.delete()) {
            file.deleteOnExit();
        }
    }

    private static final class ClearMutation {
        final String table;
        final String statementName;

        ClearMutation(String table, String statementName) {
            this.table = table;
            this.statementName = statementName;
        }
    }
}
