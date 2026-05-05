package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

final class FolioleCompanionSyncConflictCopies {

    private FolioleCompanionSyncConflictCopies() {}

    static String create(SQLiteDatabase database, JSONObject record, JSONObject snapshot, String deviceId, String now) throws Exception {
        String versionId = record.optString("version_id", "");
        if (versionId.trim().isEmpty()) {
            return null;
        }
        String mappedCopyNodeId = FolioleCompanionSyncConflictCopyMappings.load(database, versionId);
        if (mappedCopyNodeId != null) {
            return nodeExists(database, mappedCopyNodeId) ? mappedCopyNodeId : null;
        }
        String objectId = record.optString("object_id", snapshot.optString("id"));
        String sourceDeviceId = FolioleCompanionSyncConflictCopyIdentity.sourceDeviceId(record);
        FolioleCompanionSyncConflictCopyMappings.BranchMapping branchMapping =
            FolioleCompanionSyncConflictCopyMappings.loadBranch(database, objectId, sourceDeviceId);
        if (branchMapping != null && !nodeExists(database, branchMapping.copyNodeId)) {
            FolioleCompanionSyncConflictCopyMappings.save(database, versionId, branchMapping.copyNodeId, now);
            return null;
        }
        if (branchMapping != null && isStaleBranchHead(record, branchMapping)) {
            FolioleCompanionSyncConflictCopyMappings.save(database, versionId, branchMapping.copyNodeId, now);
            return null;
        }
        String copyNodeId = branchMapping == null
            ? FolioleCompanionSyncConflictCopyIdentity.copyNodeId(record)
            : branchMapping.copyNodeId;
        FolioleCompanionSyncConflictCopyProjection.upsert(database, record, snapshot, deviceId, copyNodeId, versionId, now);
        FolioleCompanionSyncConflictCopyMappings.save(database, versionId, copyNodeId, now);
        FolioleCompanionSyncConflictCopyMappings.saveBranch(
            database,
            objectId,
            sourceDeviceId,
            copyNodeId,
            now,
            versionId,
            record.optString("version_created_at", record.optString("updated_at", null))
        );
        return copyNodeId;
    }

    private static boolean isStaleBranchHead(
        JSONObject record,
        FolioleCompanionSyncConflictCopyMappings.BranchMapping branchMapping
    ) {
        if (branchMapping.sourceVersionCreatedAt == null || branchMapping.sourceVersionCreatedAt.trim().isEmpty()) {
            return false;
        }
        String createdAt = record.optString("version_created_at", record.optString("updated_at", ""));
        int createdAtCompare = createdAt.compareTo(branchMapping.sourceVersionCreatedAt);
        if (createdAtCompare != 0) {
            return createdAtCompare < 0;
        }
        return record.optString("version_id", "").compareTo(branchMapping.sourceVersionId == null ? "" : branchMapping.sourceVersionId) <= 0;
    }

    private static boolean nodeExists(SQLiteDatabase database, String nodeId) {
        try (Cursor cursor = database.rawQuery("SELECT 1 FROM nodes WHERE id = ? LIMIT 1", new String[] { nodeId })) {
            return cursor.moveToFirst();
        }
    }
}
