package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;

final class FolioleCompanionSyncGroupDatabase {
    private FolioleCompanionSyncGroupDatabase() {}

    static void registerMember(String path, JSONObject config, FolioleCompanionSyncGroupJoinRequest request) throws Exception {
        SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE);
        try {
            String groupId = config.getJSONObject("sync_group").getString("group_id");
            String now = Instant.now().toString();
            db.execSQL("INSERT OR REPLACE INTO sync_group_members (group_id, device_id, device_kind, device_name, state, " +
                "approved_by_device_id, authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at) " +
                "VALUES (?, ?, ?, ?, 'active', ?, ?, NULL, ?, NULL, NULL, ?)", new Object[] {
                    groupId, request.deviceId, request.deviceKind, request.deviceName, config.getString("device_id"),
                    request.pairRequestId, now, now
                });
        } finally { db.close(); }
    }

    static JSONObject groupForMember(String path, String localDeviceId) throws Exception {
        SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY);
        try {
            JSONObject group;
            try (Cursor row = db.rawQuery("SELECT group_id, display_name, timeline_id, created_by_device_id, created_at FROM sync_groups LIMIT 1", null)) {
                if (!row.moveToFirst()) throw new IllegalStateException("sync_group_not_available");
                group = new JSONObject().put("group_id", row.getString(0)).put("display_name", row.getString(1))
                    .put("timeline_id", row.getString(2)).put("created_by_device_id", row.getString(3))
                    .put("created_at", row.getString(4)).put("local_device_id", localDeviceId);
            }
            JSONArray members = new JSONArray();
            try (Cursor rows = db.rawQuery("SELECT device_id, device_kind, device_name, state, approved_by_device_id, " +
                    "authorization_id, joined_at FROM sync_group_members WHERE state = 'active' ORDER BY joined_at, device_id", null)) {
                while (rows.moveToNext()) members.put(new JSONObject().put("device_id", rows.getString(0))
                    .put("device_kind", rows.getString(1)).put("device_name", rows.getString(2)).put("state", rows.getString(3))
                    .put("approved_by_device_id", rows.getString(4)).put("authorization_id", rows.getString(5))
                    .put("joined_at", rows.getString(6)));
            }
            String state = "active";
            for (int index = 0; index < members.length(); index++) {
                JSONObject member = members.getJSONObject(index);
                if (localDeviceId.equals(member.getString("device_id"))) state = member.getString("state");
            }
            return group.put("local_member_state", state).put("members", members);
        } finally { db.close(); }
    }

    static void recordSupplyCursor(String path, String peerId, int fromCursor, int toCursor) {
        SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE);
        try {
            db.execSQL("INSERT OR REPLACE INTO sync_peer_cursors (peer_id, stream_name, cursor_value, updated_at) VALUES (?, ?, ?, ?)",
                new Object[] { peerId, "sync-pack-supply", fromCursor + ":" + toCursor, Instant.now().toString() });
        } finally { db.close(); }
    }

    static String requireAuthorizedMember(String path, String groupId, String deviceId) {
        SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY);
        try (Cursor row = db.rawQuery(
            "SELECT state FROM sync_group_members WHERE group_id = ? AND device_id = ? AND state = 'active' LIMIT 1",
            new String[] { groupId, deviceId })) {
            if (!row.moveToFirst()) throw new SecurityException("sync_group_member_not_authorized");
            return row.getString(0);
        } finally { db.close(); }
    }

    static void saveSyncEndpoint(String path, String endpointUrl, String now) {
        SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE);
        try {
            db.execSQL("INSERT OR REPLACE INTO companion_meta (key, value, updated_at) VALUES ('workspace_sync_endpoint_url', ?, ?)",
                new Object[] { endpointUrl, now });
        } finally { db.close(); }
    }

}
