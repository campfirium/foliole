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
        try {
            JSONArray plan = FolioleCompanionSchemaInstaller.migrationPlan(context);
            for (int index = 0; index < plan.length(); index += 1) {
                JSONObject step = plan.getJSONObject(index);
                if (oldVersion < step.getInt("beforeVersion")) {
                    runActions(context, database, step.getJSONArray("actions"));
                }
            }
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to run companion migration plan.", exception);
        }
    }

    private static void runActions(Context context, SQLiteDatabase database, JSONArray actions) throws Exception {
        for (int index = 0; index < actions.length(); index += 1) {
            runAction(context, database, actions.getJSONObject(index));
        }
    }

    private static void runAction(Context context, SQLiteDatabase database, JSONObject action) {
        String type = action.optString("type", "");
        if ("installSchema".equals(type)) {
            installSchema(context, database, action.optString("errorMessage", "Failed to install companion schema."));
            return;
        }
        if ("migrateSyncObjectStateSequence".equals(type)) {
            migrateSyncObjectStateSequence(context, database);
            return;
        }
        if ("backfillNodeAttachmentsFromVersions".equals(type)) {
            FolioleCompanionNodeAttachmentStore.backfillNodeAttachmentsFromVersions(context, database);
            return;
        }
        if ("addNodeViewStateSourceIfMissing".equals(type)) {
            addNodeViewStateSourceIfMissing(context, database);
            return;
        }
        if ("addSyncBaseContentHashIfMissing".equals(type)) {
            addSyncBaseContentHashIfMissing(context, database);
            return;
        }
        throw new IllegalStateException("Companion migration plan has unknown action: " + type);
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
