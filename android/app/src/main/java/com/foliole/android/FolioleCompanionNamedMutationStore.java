package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteStatement;

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
        database.execSQL(statement(context, "syncStateUpsert"), new Object[] {
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
        if (syncDirty == 1 && hasRows(database, statement(context, "syncPushAckTableExists"), null)) {
            database.execSQL(statement(context, "syncPushAckDeleteByObject"), new Object[] { objectType, objectId });
        }
    }

    private static ExistingState loadExistingState(Context context, SQLiteDatabase database, String objectType, String objectId) throws Exception {
        try (Cursor cursor = database.rawQuery(statement(context, "syncStateExisting"), new String[] { objectType, objectId })) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            return new ExistingState(
                cursor.getString(0),
                cursor.isNull(1) ? null : cursor.getString(1),
                cursor.getInt(2)
            );
        }
    }

    private static long nextStateSeq(Context context, SQLiteDatabase database) throws Exception {
        try (Cursor cursor = database.rawQuery(statement(context, "syncStateNextSeq"), null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 1L;
        }
    }

    private static boolean hasRows(SQLiteDatabase database, String sql, String[] args) {
        try (Cursor cursor = database.rawQuery(sql, args)) {
            return cursor.moveToFirst();
        }
    }

    private static String statement(Context context, String name) throws Exception {
        JSONObject payload = new JSONObject(FolioleCompanionAssetReader.read(context, MUTATION_ASSET_PATH));
        JSONObject statements = payload.optJSONObject("statements");
        if (statements == null) {
            throw new IllegalStateException("Companion mutation definitions asset is missing statements.");
        }
        String statement = statements.optString(name, "").trim();
        if (statement.isEmpty()) {
            throw new IllegalStateException("Companion mutation definitions asset is missing statement: " + name);
        }
        return statement;
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
