package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

final class FolioleCompanionExternalFolderOwnershipMigration {

    private FolioleCompanionExternalFolderOwnershipMigration() {}

    static void migrate(Context context, SQLiteDatabase database) {
        if (
            !FolioleCompanionSqliteRuntime.tableExists(database, "external_search_folders") ||
            FolioleCompanionSqliteRuntime.columnExists(database, "external_search_folders", "owner_installation_id")
        ) {
            return;
        }
        String[] statements = {
            "externalFoldersNextTable", "externalFoldersCopyLegacyRows", "externalFoldersDropLegacyTable",
            "externalFoldersRenameNextTable", "externalFoldersOwnerPathIndex"
        };
        database.beginTransaction();
        try {
            for (String statement : statements) {
                FolioleCompanionSchemaInstaller.installMigrationStatement(context, database, statement);
            }
            database.setTransactionSuccessful();
        } catch (Exception exception) {
            throw new IllegalStateException("Failed to migrate external folder ownership.", exception);
        } finally {
            database.endTransaction();
        }
    }
}
