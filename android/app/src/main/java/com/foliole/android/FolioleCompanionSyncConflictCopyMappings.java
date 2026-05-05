package com.foliole.android;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

final class FolioleCompanionSyncConflictCopyMappings {

    private static final String CONFLICT_COPY_KEY_PREFIX = "sync_conflict_copy:";
    private static final String CONFLICT_COPY_BRANCH_KEY_PREFIX = "sync_conflict_copy_branch:";

    private FolioleCompanionSyncConflictCopyMappings() {}

    static String load(SQLiteDatabase database, String versionId) {
        if (!tableExists(database, "companion_meta")) {
            return null;
        }
        try (Cursor cursor = database.rawQuery(
            "SELECT value FROM companion_meta WHERE key = ? LIMIT 1",
            new String[] { CONFLICT_COPY_KEY_PREFIX + versionId }
        )) {
            return cursor.moveToFirst() ? cursor.getString(0) : null;
        }
    }

    static void save(SQLiteDatabase database, String versionId, String copyNodeId, String now) {
        if (!tableExists(database, "companion_meta")) {
            return;
        }
        ContentValues values = new ContentValues();
        values.put("key", CONFLICT_COPY_KEY_PREFIX + versionId);
        values.put("value", copyNodeId);
        values.put("updated_at", now);
        database.insertWithOnConflict("companion_meta", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    static BranchMapping loadBranch(SQLiteDatabase database, String objectId, String sourceDeviceId) {
        String value = loadRaw(database, CONFLICT_COPY_BRANCH_KEY_PREFIX + objectId + ":" + sourceDeviceId);
        if (value == null) {
            return null;
        }
        try {
            JSONObject payload = new JSONObject(value);
            String copyNodeId = payload.optString("copyNodeId", "");
            return copyNodeId.trim().isEmpty()
                ? new BranchMapping(value, null, null)
                : new BranchMapping(copyNodeId, payload.optString("sourceVersionId", null), payload.optString("sourceVersionCreatedAt", null));
        } catch (Exception ignored) {
            return new BranchMapping(value, null, null);
        }
    }

    static void saveBranch(
        SQLiteDatabase database,
        String objectId,
        String sourceDeviceId,
        String copyNodeId,
        String now,
        String sourceVersionId,
        String sourceVersionCreatedAt
    ) throws Exception {
        if (!tableExists(database, "companion_meta")) {
            return;
        }
        JSONObject payload = new JSONObject()
            .put("copyNodeId", copyNodeId)
            .put("sourceVersionId", sourceVersionId == null ? JSONObject.NULL : sourceVersionId)
            .put("sourceVersionCreatedAt", sourceVersionCreatedAt == null ? JSONObject.NULL : sourceVersionCreatedAt);
        ContentValues values = new ContentValues();
        values.put("key", CONFLICT_COPY_BRANCH_KEY_PREFIX + objectId + ":" + sourceDeviceId);
        values.put("value", payload.toString());
        values.put("updated_at", now);
        database.insertWithOnConflict("companion_meta", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private static String loadRaw(SQLiteDatabase database, String key) {
        if (!tableExists(database, "companion_meta")) {
            return null;
        }
        try (Cursor cursor = database.rawQuery(
            "SELECT value FROM companion_meta WHERE key = ? LIMIT 1",
            new String[] { key }
        )) {
            return cursor.moveToFirst() ? cursor.getString(0) : null;
        }
    }

    private static boolean tableExists(SQLiteDatabase database, String tableName) {
        try (Cursor cursor = database.rawQuery(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            new String[] { tableName }
        )) {
            return cursor.moveToFirst();
        }
    }

    static final class BranchMapping {
        final String copyNodeId;
        final String sourceVersionId;
        final String sourceVersionCreatedAt;

        BranchMapping(String copyNodeId, String sourceVersionId, String sourceVersionCreatedAt) {
            this.copyNodeId = copyNodeId;
            this.sourceVersionId = sourceVersionId;
            this.sourceVersionCreatedAt = sourceVersionCreatedAt;
        }
    }
}
