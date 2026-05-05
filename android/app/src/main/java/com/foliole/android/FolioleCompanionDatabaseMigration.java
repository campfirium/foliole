package com.foliole.android;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionDatabaseMigration {

    private FolioleCompanionDatabaseMigration() {}

    static void create(Context context, SQLiteDatabase database) {
        installSchema(context, database, "Failed to install companion schema.");
        addSyncBaseContentHashIfMissing(context, database);
    }

    static void upgrade(Context context, SQLiteDatabase database, int oldVersion) {
        if (oldVersion < 4) {
            installSchema(context, database, "Failed to upgrade companion schema.");
        }
        if (oldVersion < 5) {
            migrateSyncObjectStateSequence(context, database);
            installSchema(context, database, "Failed to upgrade companion sync schema.");
        }
        if (oldVersion < 6) {
            installSchema(context, database, "Failed to upgrade companion node version schema.");
        }
        if (oldVersion < 7) {
            installSchema(context, database, "Failed to upgrade companion review log schema.");
        }
        if (oldVersion < 8) {
            installSchema(context, database, "Failed to upgrade companion attachment link schema.");
        }
        if (oldVersion < 9) {
            FolioleCompanionNodeAttachmentStore.backfillNodeAttachmentsFromVersions(context, database);
        }
        if (oldVersion < 10) {
            installSchema(context, database, "Failed to upgrade companion content blob schema.");
        }
        if (oldVersion < 11) {
            installSchema(context, database, "Failed to upgrade companion content blob data schema.");
        }
        if (oldVersion < 12) {
            installSchema(context, database, "Failed to upgrade companion view state source schema.");
            addNodeViewStateSourceIfMissing(context, database);
        }
        if (oldVersion < 13) {
            installSchema(context, database, "Failed to upgrade companion push base reference schema.");
            addSyncBaseContentHashIfMissing(context, database);
        }
        if (oldVersion < 14) {
            installSchema(context, database, "Failed to upgrade companion push ack schema.");
        }
    }

    private static void installSchema(Context context, SQLiteDatabase database, String errorMessage) {
        try {
            FolioleCompanionSchemaInstaller.install(context, database);
        } catch (Exception exception) {
            throw new IllegalStateException(errorMessage, exception);
        }
    }

    private static void migrateSyncObjectStateSequence(Context context, SQLiteDatabase database) {
        if (!tableExists(database, "sync_object_state") || columnExists(database, "sync_object_state", "state_seq")) {
            return;
        }
        database.beginTransaction();
        try {
            installMigrationStatement(context, database, "syncObjectStateNextTable", "Failed to create sync object state repair table.");
            copyLegacySyncObjectStateRows(database);
            installMigrationStatement(context, database, "syncObjectStateDropLegacyTable", "Failed to drop legacy sync object state table.");
            installMigrationStatement(context, database, "syncObjectStateRenameNextTable", "Failed to rename sync object state repair table.");
            createSyncObjectStateIndexes(context, database);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    private static void copyLegacySyncObjectStateRows(SQLiteDatabase database) {
        try (Cursor cursor = database.query(
            "sync_object_state",
            new String[] {
                "object_type",
                "object_id",
                "current_version_id",
                "content_hash",
                "last_modified_by_device_id",
                "updated_at",
                "deleted_at",
                "sync_dirty"
            },
            null,
            null,
            null,
            null,
            "updated_at ASC, object_type ASC, object_id ASC"
        )) {
            int stateSeq = 1;
            while (cursor.moveToNext()) {
                ContentValues values = new ContentValues();
                values.put("object_type", cursor.getString(0));
                values.put("object_id", cursor.getString(1));
                values.put("state_seq", stateSeq);
                values.put("current_version_id", cursor.isNull(2) ? null : cursor.getString(2));
                values.put("content_hash", cursor.getString(3));
                values.put("last_modified_by_device_id", cursor.getString(4));
                values.put("updated_at", cursor.getString(5));
                values.put("deleted_at", cursor.isNull(6) ? null : cursor.getString(6));
                values.put("sync_dirty", cursor.getInt(7));
                values.put("base_content_hash", (String) null);
                database.insertOrThrow("sync_object_state_next", null, values);
                stateSeq += 1;
            }
        }
    }

    private static void addSyncBaseContentHashIfMissing(Context context, SQLiteDatabase database) {
        if (columnExists(database, "sync_object_state", "base_content_hash")) {
            return;
        }
        installMigrationStatement(context, database, "syncObjectStateBaseContentHashColumn", "Failed to add sync base content hash column.");
    }

    private static void addNodeViewStateSourceIfMissing(Context context, SQLiteDatabase database) {
        if (columnExists(database, "node_view_state", "source")) {
            return;
        }
        installMigrationStatement(context, database, "nodeViewStateSourceColumn", "Failed to add node view state source column.");
    }

    private static void createSyncObjectStateIndexes(Context context, SQLiteDatabase database) {
        installMigrationStatement(context, database, "syncObjectStateSeqIndex", "Failed to create sync object state sequence index.");
        installMigrationStatement(context, database, "syncObjectStateTypeSeqIndex", "Failed to create sync object state type sequence index.");
    }

    private static void installMigrationStatement(
        Context context,
        SQLiteDatabase database,
        String statementName,
        String errorMessage
    ) {
        try {
            FolioleCompanionSchemaInstaller.installMigrationStatement(context, database, statementName);
        } catch (Exception exception) {
            throw new IllegalStateException(errorMessage, exception);
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

    private static boolean columnExists(SQLiteDatabase database, String table, String column) {
        try (Cursor cursor = database.rawQuery("PRAGMA table_info(" + table + ")", null)) {
            while (cursor.moveToNext()) {
                if (column.equals(cursor.getString(cursor.getColumnIndexOrThrow("name")))) {
                    return true;
                }
            }
        }
        return false;
    }
}
