package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONObject;

final class FolioleCompanionSyncLocalNodeState {
    final String currentVersionId;
    final String deletedAt;
    final int syncDirty;

    private FolioleCompanionSyncLocalNodeState(String currentVersionId, String deletedAt, int syncDirty) {
        this.currentVersionId = currentVersionId == null ? "" : currentVersionId;
        this.deletedAt = deletedAt;
        this.syncDirty = syncDirty;
    }

    static FolioleCompanionSyncLocalNodeState load(SQLiteDatabase database, String nodeId) {
        try (Cursor cursor = database.query(
            "nodes",
            new String[] { "current_version_id", "deleted_at", "sync_dirty" },
            "id = ?",
            new String[] { nodeId },
            null,
            null,
            null,
            "1"
        )) {
            if (!cursor.moveToFirst()) {
                return null;
            }
            return new FolioleCompanionSyncLocalNodeState(
                cursor.isNull(0) ? "" : cursor.getString(0),
                cursor.isNull(1) ? null : cursor.getString(1),
                cursor.getInt(2)
            );
        }
    }

    boolean blocks(JSONObject record, JSONObject snapshot) {
        if (currentVersionId.equals(record.optString("version_id", ""))) {
            return false;
        }
        if (!snapshot.isNull("deleted_at")) {
            return false;
        }
        if (syncDirty == 1) {
            return true;
        }
        return deletedAt != null && snapshot.isNull("deleted_at");
    }
}
