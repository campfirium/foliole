package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import java.io.File;
import java.time.Instant;

final class FolioleCompanionAppDataStore {
    private static final String[] CLEARED_TABLES = {
        "sync_push_ack",
        "sync_peer_cursors",
        "sync_change_log",
        "sync_object_state",
        "node_sync_conflicts",
        "node_sync_versions",
        "node_view_state",
        "node_reading_device_state",
        "node_order",
        "node_attachments",
        "attachment_blobs",
        "attachments",
        "pdf_page_text",
        "content_blob_data",
        "content_blobs",
        "external_documents",
        "external_search_folders",
        "import_sources",
        "review_log",
        "node_reading",
        "node_review",
        "setting_records",
        "nodes",
        "workspace_meta"
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
                clearTables(database);
                database.delete("companion_meta", "key <> ?", new String[] { "device_id" });
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
            deleteRecursively(new File(context.getFilesDir(), "attachments"));
            return FolioleCompanionSyncMetaStore.loadWorkspaceSyncState(context, database);
        }
    }

    private static void clearTables(SQLiteDatabase database) {
        for (String table : CLEARED_TABLES) {
            if (tableExists(database, table)) {
                database.delete(table, null, null);
            }
        }
    }

    private static boolean tableExists(SQLiteDatabase database, String table) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            new String[] { table }
        )) {
            return cursor.moveToFirst();
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
}
