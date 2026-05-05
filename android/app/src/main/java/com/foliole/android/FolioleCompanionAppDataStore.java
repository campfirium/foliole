package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.time.Instant;

final class FolioleCompanionAppDataStore {
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
                FolioleCompanionGeneratedMutationRunner.execute(context, database, mutationRule(context, "deleteMetaExceptDeviceMutationName"), null);
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }
            deleteRecursively(new File(context.getFilesDir(), FolioleCompanionResourceReadQueryRules.attachmentString(context, "directoryName")));
            return FolioleCompanionSyncMetaStore.loadWorkspaceSyncState(context, database);
        }
    }

    private static void clearTables(Context context, SQLiteDatabase database) throws Exception {
        JSONArray mutations = FolioleCompanionGeneratedMutationRunner.appDataClearMutations(context);
        for (int index = 0; index < mutations.length(); index += 1) {
            JSONObject mutation = mutations.getJSONObject(index);
            String table = mutation.getString("table");
            if (FolioleCompanionSqliteRuntime.tableExists(database, table)) {
                FolioleCompanionGeneratedMutationRunner.execute(context, database, mutation.getString("statementName"), null);
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

    private static String mutationRule(Context context, String key) throws Exception {
        return FolioleCompanionHostSupportMutationRules.appDataString(context, key);
    }

}
