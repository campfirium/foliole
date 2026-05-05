package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

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
        if (
            !FolioleCompanionSqliteRuntime.tableExists(database, "sync_object_state") ||
            FolioleCompanionSqliteRuntime.columnExists(database, "sync_object_state", "state_seq")
        ) {
            return;
        }
        database.beginTransaction();
        try {
            installMigrationStatement(context, database, "syncObjectStateNextTable", "Failed to create sync object state repair table.");
            copyLegacySyncObjectStateRows(context, database);
            installMigrationStatement(context, database, "syncObjectStateDropLegacyTable", "Failed to drop legacy sync object state table.");
            installMigrationStatement(context, database, "syncObjectStateRenameNextTable", "Failed to rename sync object state repair table.");
            createSyncObjectStateIndexes(context, database);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    private static void copyLegacySyncObjectStateRows(Context context, SQLiteDatabase database) {
        try {
            JSONArray rows = FolioleCompanionNamedQueryStore.loadArray(context, database, "migrationLegacySyncObjectStateRows").getJSONArray("rows");
            for (int index = 0; index < rows.length(); index += 1) {
                insertLegacySyncObjectStateRow(context, database, rows.getJSONObject(index), index + 1);
            }
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to load legacy sync object state rows.", exception);
        }
    }

    private static void insertLegacySyncObjectStateRow(Context context, SQLiteDatabase database, JSONObject row, int stateSeq) {
        try {
            FolioleCompanionNamedMutationStore.execute(context, database, "migrationSyncObjectStateNextInsert", new Object[] {
                row.getString("object_type"),
                row.getString("object_id"),
                stateSeq,
                nullableString(row, "current_version_id"),
                row.getString("content_hash"),
                row.getString("last_modified_by_device_id"),
                row.getString("updated_at"),
                nullableString(row, "deleted_at"),
                row.getInt("sync_dirty"),
                null
            });
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to copy legacy sync object state row.", exception);
        }
    }

    private static String nullableString(JSONObject row, String key) {
        return row.isNull(key) ? null : row.optString(key, null);
    }

    private static void addSyncBaseContentHashIfMissing(Context context, SQLiteDatabase database) {
        if (FolioleCompanionSqliteRuntime.columnExists(database, "sync_object_state", "base_content_hash")) {
            return;
        }
        installMigrationStatement(context, database, "syncObjectStateBaseContentHashColumn", "Failed to add sync base content hash column.");
    }

    private static void addNodeViewStateSourceIfMissing(Context context, SQLiteDatabase database) {
        if (FolioleCompanionSqliteRuntime.columnExists(database, "node_view_state", "source")) {
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

}
