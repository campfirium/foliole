package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionSyncConflictStore {
    private FolioleCompanionSyncConflictStore() {}

    static JSObject loadNodeConflicts(SQLiteDatabase database) throws Exception {
        JSArray conflicts = new JSArray();
        String sql = "SELECT conflict_version_id, object_id, parent_version_id, device_id, " +
            "content_hash, snapshot_json, detected_at FROM node_sync_conflicts " +
            "ORDER BY detected_at DESC, conflict_version_id DESC";
        try (Cursor row = database.rawQuery(sql, null)) {
            while (row.moveToNext()) {
                conflicts.put(toConflictRecord(row));
            }
        }
        JSObject result = new JSObject();
        result.put("conflicts", conflicts);
        return result;
    }

    private static JSObject toConflictRecord(Cursor row) throws Exception {
        JSObject record = new JSObject();
        record.put("conflict_version_id", row.getString(0));
        record.put("object_id", row.getString(1));
        record.put("parent_version_id", row.isNull(2) ? JSONObject.NULL : row.getString(2));
        record.put("device_id", row.isNull(3) ? JSONObject.NULL : row.getString(3));
        record.put("content_hash", row.isNull(4) ? JSONObject.NULL : row.getString(4));
        record.put("snapshot", new JSONObject(row.getString(5)));
        record.put("detected_at", row.getString(6));
        return record;
    }
}
