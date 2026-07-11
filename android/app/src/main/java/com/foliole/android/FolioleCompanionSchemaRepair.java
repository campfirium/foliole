package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionSchemaRepair {

    private FolioleCompanionSchemaRepair() {}

    static void repairCurrentSchema(Context context, SQLiteDatabase database) {
        installSchema(context, database);
        addNodeViewStateSourceIfMissing(context, database);
        addSyncBaseContentHashIfMissing(context, database);
        addNodesEnableShortTermIfMissing(context, database);
        addNodesSequentialReadingEnabledIfMissing(context, database);
        addNodesManualChildOrderIfMissing(context, database);
        addNodesShelvedAtIfMissing(context, database);
        addNodesImportSourceFingerprintIfMissing(context, database);
        addNodesImportContentFingerprintIfMissing(context, database);
    }

    static void addSyncBaseContentHashIfMissing(Context context, SQLiteDatabase database) {
        addColumnIfMissing(context, database, "syncBaseContentHash");
    }

    static void addNodeViewStateSourceIfMissing(Context context, SQLiteDatabase database) {
        addColumnIfMissing(context, database, "nodeViewStateSource");
    }

    static void addNodesEnableShortTermIfMissing(Context context, SQLiteDatabase database) {
        addColumnIfMissing(context, database, "nodesEnableShortTerm");
    }

    static void addNodesSequentialReadingEnabledIfMissing(Context context, SQLiteDatabase database) {
        addColumnIfMissing(context, database, "nodesSequentialReadingEnabled");
    }

    static void addNodesManualChildOrderIfMissing(Context context, SQLiteDatabase database) {
        addColumnIfMissing(context, database, "nodesManualChildOrder");
    }

    static void addNodesShelvedAtIfMissing(Context context, SQLiteDatabase database) {
        addColumnIfMissing(context, database, "nodesShelvedAt");
    }

    static void addNodesImportSourceFingerprintIfMissing(Context context, SQLiteDatabase database) {
        addColumnIfMissing(context, database, "nodesImportSourceFingerprint");
    }

    static void addNodesImportContentFingerprintIfMissing(Context context, SQLiteDatabase database) {
        addColumnIfMissing(context, database, "nodesImportContentFingerprint");
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
            throw new IllegalStateException("Companion schema repair rule is missing: " + groupName, exception);
        }
    }

    private static void installSchema(Context context, SQLiteDatabase database) {
        try {
            FolioleCompanionSchemaInstaller.install(context, database);
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to repair companion schema.", exception);
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
}
