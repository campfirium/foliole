package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

final class FolioleCompanionSyncDiagnosticState {
    private FolioleCompanionSyncDiagnosticState() {}

    static JSObject load(SQLiteDatabase database) throws Exception {
        JSObject state = new JSObject();
        int cursor = loadNumberMetaValue(database, "sync_pack_cursor");
        long maxStateSeq = count(database, "SELECT COALESCE(MAX(state_seq), 0) FROM sync_object_state");
        state.put("pack_cursor", cursor <= 0 ? JSONObject.NULL : cursor);
        state.put("max_state_seq", maxStateSeq <= 0 ? JSONObject.NULL : maxStateSeq);
        state.put("local_dirty_count", count(database, "SELECT COUNT(*) FROM sync_object_state WHERE sync_dirty = 1"));
        state.put("ready_dirty_count", count(database, readyDirtySql("COUNT(*)")));
        state.put("pending_ack_count", count(database,
            "SELECT COUNT(*) FROM sync_push_ack WHERE status IN ('accepted', 'already_applied')"
        ));
        state.put("push_issue_count", count(database,
            "SELECT COUNT(*) FROM sync_push_ack WHERE status IN ('conflict', 'rejected')"
        ));
        state.put("dirty_objects", loadDirtyObjects(database));
        state.put("pending_acks", loadPushAcks(database, "accepted", "already_applied"));
        state.put("push_issues", loadPushAcks(database, "conflict", "rejected"));
        state.put("state_counts", loadStateCounts(database));
        return state;
    }

    private static JSArray loadStateCounts(SQLiteDatabase database) throws Exception {
        JSArray items = new JSArray();
        try (Cursor cursor = database.rawQuery(
            "SELECT state.object_type, COUNT(*), SUM(CASE WHEN state.sync_dirty = 1 THEN 1 ELSE 0 END), " +
                "MIN(state.state_seq), MAX(state.state_seq), COALESCE(pending.count, 0), COALESCE(issues.count, 0), " +
                "SUM(CASE WHEN state.sync_dirty = 1 AND NOT EXISTS (" +
                "SELECT 1 FROM sync_push_ack ack WHERE ack.object_type = state.object_type " +
                "AND ack.object_id = state.object_id) THEN 1 ELSE 0 END) " +
                "FROM sync_object_state state " +
                "LEFT JOIN (SELECT object_type, COUNT(*) AS count FROM sync_push_ack " +
                "WHERE status IN ('accepted', 'already_applied') GROUP BY object_type) pending " +
                "ON pending.object_type = state.object_type " +
                "LEFT JOIN (SELECT object_type, COUNT(*) AS count FROM sync_push_ack " +
                "WHERE status IN ('conflict', 'rejected') GROUP BY object_type) issues " +
                "ON issues.object_type = state.object_type GROUP BY state.object_type ORDER BY state.object_type ASC",
            null
        )) {
            while (cursor.moveToNext()) {
                items.put(readStateCount(cursor));
            }
        }
        return items;
    }

    private static JSObject readStateCount(Cursor cursor) {
        JSObject row = new JSObject();
        row.put("object_type", cursor.getString(0));
        row.put("count", cursor.getLong(1));
        row.put("dirty_count", cursor.getLong(2));
        row.put("min_state_seq", cursor.isNull(3) ? JSONObject.NULL : cursor.getLong(3));
        row.put("max_state_seq", cursor.isNull(4) ? JSONObject.NULL : cursor.getLong(4));
        row.put("pending_ack_count", cursor.getLong(5));
        row.put("push_issue_count", cursor.getLong(6));
        row.put("ready_dirty_count", cursor.getLong(7));
        return row;
    }

    private static JSArray loadDirtyObjects(SQLiteDatabase database) throws Exception {
        JSArray items = new JSArray();
        try (Cursor cursor = database.rawQuery(
            "SELECT object_type, object_id, content_hash, state_seq, updated_at, base_content_hash " +
                "FROM sync_object_state WHERE sync_dirty = 1 " +
                "AND NOT EXISTS (SELECT 1 FROM sync_push_ack ack WHERE ack.object_type = sync_object_state.object_type " +
                "AND ack.object_id = sync_object_state.object_id) ORDER BY state_seq DESC LIMIT 50",
            null
        )) {
            while (cursor.moveToNext()) {
                JSObject row = new JSObject();
                row.put("object_type", cursor.getString(0));
                row.put("object_id", cursor.getString(1));
                row.put("content_hash", cursor.isNull(2) ? JSONObject.NULL : cursor.getString(2));
                row.put("state_seq", cursor.isNull(3) ? JSONObject.NULL : cursor.getLong(3));
                row.put("updated_at", cursor.isNull(4) ? JSONObject.NULL : cursor.getString(4));
                row.put("base_content_hash", cursor.isNull(5) ? JSONObject.NULL : cursor.getString(5));
                items.put(row);
            }
        }
        return items;
    }

    private static JSArray loadPushAcks(SQLiteDatabase database, String firstStatus, String secondStatus) throws Exception {
        JSArray items = new JSArray();
        try (Cursor cursor = database.rawQuery(
            "SELECT client_op_id, object_type, object_id, state_seq, status, acked_at " +
                "FROM sync_push_ack WHERE status IN (?, ?) ORDER BY acked_at ASC LIMIT 50",
            new String[] { firstStatus, secondStatus }
        )) {
            while (cursor.moveToNext()) {
                JSObject row = new JSObject();
                row.put("client_op_id", cursor.getString(0));
                row.put("object_type", cursor.getString(1));
                row.put("object_id", cursor.getString(2));
                row.put("state_seq", cursor.isNull(3) ? JSONObject.NULL : cursor.getLong(3));
                row.put("status", cursor.getString(4));
                row.put("acked_at", cursor.getString(5));
                items.put(row);
            }
        }
        return items;
    }

    private static String readyDirtySql(String projection) {
        return "SELECT " + projection + " FROM sync_object_state state WHERE state.sync_dirty = 1 " +
            "AND NOT EXISTS (SELECT 1 FROM sync_push_ack ack WHERE ack.object_type = state.object_type " +
            "AND ack.object_id = state.object_id)";
    }

    private static long count(SQLiteDatabase database, String sql) {
        try (Cursor cursor = database.rawQuery(sql, null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 0L;
        }
    }

    private static int loadNumberMetaValue(SQLiteDatabase database, String key) {
        String stored = FolioleCompanionSyncDiagnosticMeta.load(database, key);
        return stored == null ? 0 : Math.max(0, Integer.parseInt(stored));
    }
}
