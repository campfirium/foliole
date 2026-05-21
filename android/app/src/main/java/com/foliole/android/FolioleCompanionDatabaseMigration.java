package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionDatabaseMigration {

    private FolioleCompanionDatabaseMigration() {}

    static void create(Context context, SQLiteDatabase database) {
        installSchema(context, database, defaultMessage(context, "installSchemaErrorMessage"));
        addSyncBaseContentHashIfMissing(context, database);
    }

    static void upgrade(Context context, SQLiteDatabase database, int oldVersion) {
        try {
            JSONArray plan = FolioleCompanionSchemaInstaller.migrationPlan(context);
            for (int index = 0; index < plan.length(); index += 1) {
                JSONObject step = plan.getJSONObject(index);
                if (oldVersion < step.getInt(planKey(context, "beforeVersion"))) {
                    runActions(context, database, step.getJSONArray(planKey(context, "actions")));
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
        String type = action.optString(actionKey(context, "type"), "");
        if (actionType(context, "installSchema").equals(type)) {
            installSchema(
                context,
                database,
                action.optString(actionKey(context, "errorMessage"), defaultMessage(context, "installSchemaErrorMessage"))
            );
            return;
        }
        if (actionType(context, "migrateSyncObjectStateSequence").equals(type)) {
            migrateSyncObjectStateSequence(context, database);
            return;
        }
        if (actionType(context, "backfillNodeAttachmentsFromVersions").equals(type)) {
            FolioleCompanionNodeAttachmentStore.backfillNodeAttachmentsFromVersions(context, database);
            return;
        }
        if (actionType(context, "addNodeViewStateSourceIfMissing").equals(type)) {
            addNodeViewStateSourceIfMissing(context, database);
            return;
        }
        if (actionType(context, "addSyncBaseContentHashIfMissing").equals(type)) {
            addSyncBaseContentHashIfMissing(context, database);
            return;
        }
        if (actionType(context, "addNodesEnableShortTermIfMissing").equals(type)) {
            addNodesEnableShortTermIfMissing(context, database);
            return;
        }
        if (actionType(context, "addNodesSequentialReadingEnabledIfMissing").equals(type)) {
            addNodesSequentialReadingEnabledIfMissing(context, database);
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
            !FolioleCompanionSqliteRuntime.tableExists(database, syncObjectStateTable(context)) ||
            FolioleCompanionSqliteRuntime.columnExists(database, syncObjectStateTable(context), syncObjectStateSeqColumn(context))
        ) {
            return;
        }
        database.beginTransaction();
        try {
            installMigrationStatement(context, database, repairValue(context, "createNextStatementName"), repairValue(context, "createNextErrorMessage"));
            copyLegacySyncObjectStateRows(context, database);
            installMigrationStatement(context, database, repairValue(context, "dropLegacyStatementName"), repairValue(context, "dropLegacyErrorMessage"));
            installMigrationStatement(context, database, repairValue(context, "renameNextStatementName"), repairValue(context, "renameNextErrorMessage"));
            createSyncObjectStateIndexes(context, database);
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    private static void copyLegacySyncObjectStateRows(Context context, SQLiteDatabase database) {
        try {
            JSONArray rows = FolioleCompanionGeneratedQueryRunner
                .load(context, database, repairValue(context, "legacyRowsQueryName"))
                .getJSONArray(repairValue(context, "legacyRowsResultKey"));
            for (int index = 0; index < rows.length(); index += 1) {
                insertLegacySyncObjectStateRow(context, database, rows.getJSONObject(index), index + 1);
            }
        } catch (Exception exception) {
            throw new IllegalStateException(repairValue(context, "legacyRowsErrorMessage"), exception);
        }
    }

    private static void insertLegacySyncObjectStateRow(Context context, SQLiteDatabase database, JSONObject row, int stateSeq) {
        try {
            FolioleCompanionGeneratedMutationRunner.execute(context, database, repairValue(context, "nextInsertMutationName"), new Object[] {
                rowString(context, row, "objectType"),
                rowString(context, row, "objectId"),
                stateSeq,
                rowNullableString(context, row, "currentVersionId"),
                rowString(context, row, "contentHash"),
                rowString(context, row, "lastModifiedByDeviceId"),
                rowString(context, row, "updatedAt"),
                rowNullableString(context, row, "deletedAt"),
                rowInt(context, row, "syncDirty"),
                null
            });
        } catch (Exception exception) {
            throw new IllegalStateException(repairValue(context, "nextInsertErrorMessage"), exception);
        }
    }

    private static void addSyncBaseContentHashIfMissing(Context context, SQLiteDatabase database) {
        addColumnIfMissing(context, database, "syncBaseContentHash");
    }

    private static void addNodeViewStateSourceIfMissing(Context context, SQLiteDatabase database) {
        addColumnIfMissing(context, database, "nodeViewStateSource");
    }

    private static void addNodesEnableShortTermIfMissing(Context context, SQLiteDatabase database) {
        addColumnIfMissing(context, database, "nodesEnableShortTerm");
    }

    private static void addNodesSequentialReadingEnabledIfMissing(Context context, SQLiteDatabase database) {
        addColumnIfMissing(context, database, "nodesSequentialReadingEnabled");
    }

    private static void addColumnIfMissing(Context context, SQLiteDatabase database, String groupName) {
        try {
            if (
                FolioleCompanionSqliteRuntime.columnExists(
                    database,
                    FolioleCompanionMigrationRules.repairTableName(context, groupName),
                    FolioleCompanionMigrationRules.repairColumnName(context, groupName)
                )
            ) {
                return;
            }
            installMigrationStatement(
                context,
                database,
                FolioleCompanionMigrationRules.repairStatementName(context, groupName),
                FolioleCompanionMigrationRules.repairErrorMessage(context, groupName)
            );
        } catch (Exception exception) {
            throw new IllegalStateException("Companion migration add-column repair rule is missing: " + groupName, exception);
        }
    }

    private static void createSyncObjectStateIndexes(Context context, SQLiteDatabase database) {
        try {
            JSONArray statements = FolioleCompanionMigrationRules.stringArray(context, "syncObjectStateSequence", "indexStatementNames");
            for (int index = 0; index < statements.length(); index += 1) {
                installMigrationStatement(context, database, statements.getString(index), repairValue(context, "indexStatementErrorMessage"));
            }
        } catch (Exception exception) {
            throw new IllegalStateException(repairValue(context, "indexStatementsErrorMessage"), exception);
        }
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

    private static String syncObjectStateTable(Context context) {
        return repairValue(context, "tableName");
    }

    private static String syncObjectStateSeqColumn(Context context) {
        return repairValue(context, "stateSeqColumnName");
    }

    private static String repairValue(Context context, String key) {
        return repairRuleValue(context, "syncObjectStateSequence", key);
    }

    private static String repairRuleValue(Context context, String groupName, String key) {
        try {
            return FolioleCompanionMigrationRules.stringValue(context, groupName, key);
        } catch (Exception exception) {
            throw new IllegalStateException("Companion migration repair rule is missing: " + groupName + "." + key, exception);
        }
    }

    private static int rowInt(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionMigrationRules.rowInt(context, row, key);
    }

    private static String rowNullableString(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionMigrationRules.rowNullableString(context, row, key);
    }

    private static String rowString(Context context, JSONObject row, String key) throws Exception {
        return FolioleCompanionMigrationRules.rowString(context, row, key);
    }

    private static String actionType(Context context, String key) {
        try {
            return FolioleCompanionMigrationRules.actionType(context, key);
        } catch (Exception exception) {
            throw new IllegalStateException("Companion migration action type is missing: " + key, exception);
        }
    }

    private static String actionKey(Context context, String key) {
        try {
            return FolioleCompanionMigrationRules.actionKey(context, key);
        } catch (Exception exception) {
            throw new IllegalStateException("Companion migration action key is missing: " + key, exception);
        }
    }

    private static String defaultMessage(Context context, String key) {
        try {
            return FolioleCompanionMigrationRules.defaultMessage(context, key);
        } catch (Exception exception) {
            throw new IllegalStateException("Companion migration default message is missing: " + key, exception);
        }
    }

    private static String planKey(Context context, String key) {
        try {
            return FolioleCompanionMigrationRules.planKey(context, key);
        } catch (Exception exception) {
            throw new IllegalStateException("Companion migration plan key is missing: " + key, exception);
        }
    }

}
