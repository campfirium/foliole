package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteStatement;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionNamedMutationStore {
    private static final String MUTATION_ASSET_PATH = "companion-mutation-definitions.json";

    private FolioleCompanionNamedMutationStore() {}

    static void execute(Context context, SQLiteDatabase database, String statementName, Object[] args) throws Exception {
        database.execSQL(statement(context, statementName), args);
    }

    static int executeChanged(Context context, SQLiteDatabase database, String statementName, Object[] args) throws Exception {
        try (SQLiteStatement compiled = database.compileStatement(statement(context, statementName))) {
            bindArgs(compiled, args);
            return compiled.executeUpdateDelete();
        }
    }

    static JSONArray appDataClearMutations(Context context) throws Exception {
        JSONObject payload = loadPayload(context);
        JSONArray mutations = payload.optJSONArray(FolioleCompanionMutationAssetKeys.key(context, "appDataClearMutations"));
        if (mutations == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing app data clear mutations.");
        }
        return mutations;
    }

    static void upsertSyncStateRow(
        Context context,
        SQLiteDatabase database,
        String objectType,
        String objectId,
        String currentVersionId,
        String contentHash,
        String deviceId,
        String updatedAt,
        String deletedAt,
        int syncDirty
    ) throws Exception {
        ExistingState current = loadExistingState(context, database, objectType, objectId);
        database.execSQL(statement(context, syncStateMutationRule(context, "upsertMutationName")), new Object[] {
            objectType,
            objectId,
            nextStateSeq(context, database),
            currentVersionId,
            contentHash,
            nextBaseContentHash(current, syncDirty),
            deviceId,
            updatedAt,
            deletedAt,
            syncDirty
        });
        if (syncDirty == 1 && FolioleCompanionSqliteRuntime.tableExists(database, syncPushAckMutationRule(context, "tableName"))) {
            database.execSQL(statement(context, syncPushAckMutationRule(context, "deleteByObjectMutationName")), new Object[] { objectType, objectId });
        }
    }

    private static ExistingState loadExistingState(Context context, SQLiteDatabase database, String objectType, String objectId) throws Exception {
        JSONObject row = FolioleCompanionGeneratedQueryRunner.loadFirstRow(
            context,
            database,
            runtimeRule(context, "existingState", "queryName"),
            runtimeRule(context, "existingState", "resultKey"),
            new String[] { objectType, objectId }
        );
        if (row == null) return null;
        String contentHashKey = runtimeRule(context, "existingState", "contentHashKey");
        String baseContentHashKey = runtimeRule(context, "existingState", "baseContentHashKey");
        String syncDirtyKey = runtimeRule(context, "existingState", "syncDirtyKey");
        return new ExistingState(row.getString(contentHashKey), row.isNull(baseContentHashKey) ? null : row.getString(baseContentHashKey), row.getInt(syncDirtyKey));
    }

    private static long nextStateSeq(Context context, SQLiteDatabase database) throws Exception {
        JSONObject row = FolioleCompanionGeneratedQueryRunner.loadFirstRow(
            context,
            database,
            runtimeRule(context, "nextStateSeq", "queryName"),
            runtimeRule(context, "nextStateSeq", "resultKey"),
            null
        );
        return row == null ? 1L : row.getLong(runtimeRule(context, "nextStateSeq", "nextStateSeqKey"));
    }

    private static String statement(Context context, String name) throws Exception {
        JSONObject payload = loadPayload(context);
        JSONObject statements = payload.optJSONObject(FolioleCompanionMutationAssetKeys.key(context, "statements"));
        if (statements == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing statements.");
        }
        String statement = statements.optString(name, "").trim();
        if (statement.isEmpty()) {
            throw new IllegalStateException("Companion mutation definitions asset is missing statement: " + name);
        }
        return statement;
    }

    private static JSONObject loadPayload(Context context) throws Exception {
        return new JSONObject(FolioleCompanionAssetReader.read(context, MUTATION_ASSET_PATH));
    }

    private static String runtimeRule(Context context, String groupName, String key) throws Exception {
        return FolioleCompanionRuntimeQueryRules.stringValue(context, groupName, key);
    }

    private static String syncPushAckMutationRule(Context context, String key) throws Exception {
        return FolioleCompanionRuntimeMutationRules.syncPushAckString(context, key);
    }

    private static String syncStateMutationRule(Context context, String key) throws Exception {
        return FolioleCompanionRuntimeMutationRules.syncStateString(context, key);
    }

    private static void bindArgs(SQLiteStatement statement, Object[] args) {
        if (args == null) {
            return;
        }
        for (int index = 0; index < args.length; index += 1) {
            bindArg(statement, index + 1, args[index]);
        }
    }

    private static void bindArg(SQLiteStatement statement, int index, Object value) {
        if (value == null) {
            statement.bindNull(index);
        } else if (value instanceof byte[]) {
            statement.bindBlob(index, (byte[]) value);
        } else if (value instanceof Double || value instanceof Float) {
            statement.bindDouble(index, ((Number) value).doubleValue());
        } else if (value instanceof Number) {
            statement.bindLong(index, ((Number) value).longValue());
        } else {
            statement.bindString(index, value.toString());
        }
    }

    private static String nextBaseContentHash(ExistingState current, int syncDirty) {
        if (syncDirty != 1 || current == null) {
            return null;
        }
        return current.syncDirty == 1 && current.baseContentHash != null
            ? current.baseContentHash
            : current.contentHash;
    }

    private static final class ExistingState {
        final String contentHash;
        final String baseContentHash;
        final int syncDirty;

        ExistingState(String contentHash, String baseContentHash, int syncDirty) {
            this.contentHash = contentHash;
            this.baseContentHash = baseContentHash;
            this.syncDirty = syncDirty;
        }
    }
}
