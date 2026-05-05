package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;

final class FolioleCompanionGeneratedMutationRunner {
    private FolioleCompanionGeneratedMutationRunner() {}

    static void execute(Context context, SQLiteDatabase database, String statementName, Object[] args) throws Exception {
        FolioleCompanionNamedMutationStore.execute(context, database, statementName, args);
    }

    static int executeChanged(Context context, SQLiteDatabase database, String statementName, Object[] args) throws Exception {
        return FolioleCompanionNamedMutationStore.executeChanged(context, database, statementName, args);
    }

    static JSONArray appDataClearMutations(Context context) throws Exception {
        return FolioleCompanionNamedMutationStore.appDataClearMutations(context);
    }

    static void upsertSyncStateRow(
        Context context,
        SQLiteDatabase database,
        String objectType,
        String objectId,
        String currentVersionId,
        String contentHash,
        String modifiedByDeviceId,
        String updatedAt,
        String deletedAt,
        int syncDirty
    ) throws Exception {
        FolioleCompanionNamedMutationStore.upsertSyncStateRow(
            context,
            database,
            objectType,
            objectId,
            currentVersionId,
            contentHash,
            modifiedByDeviceId,
            updatedAt,
            deletedAt,
            syncDirty
        );
    }
}
