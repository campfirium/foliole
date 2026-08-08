package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.io.File;

final class FolioleCompanionSyncGroupDatabase {
    private FolioleCompanionSyncGroupDatabase() {}

    static int registerProvisioning(String path, JSONObject config, FolioleCompanionSyncGroupJoinRequest request) throws Exception {
        SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE);
        try {
            int cursor = maxStateSeq(db);
            String groupId = config.getJSONObject("sync_group").getString("group_id");
            String now = Instant.now().toString();
            db.execSQL("INSERT INTO sync_group_members (group_id, device_id, device_kind, device_name, state, " +
                "approved_by_device_id, authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at) " +
                "VALUES (?, ?, ?, ?, 'provisioning', ?, ?, ?, ?, NULL, NULL, ?) " +
                "ON CONFLICT(group_id, device_id) DO UPDATE SET " +
                "device_kind = CASE WHEN sync_group_members.state = 'active' THEN sync_group_members.device_kind ELSE excluded.device_kind END, " +
                "device_name = CASE WHEN sync_group_members.state = 'active' THEN sync_group_members.device_name ELSE excluded.device_name END, " +
                "state = CASE WHEN sync_group_members.state = 'active' THEN 'active' ELSE 'provisioning' END, " +
                "approved_by_device_id = CASE WHEN sync_group_members.state = 'active' THEN sync_group_members.approved_by_device_id ELSE excluded.approved_by_device_id END, " +
                "authorization_id = CASE WHEN sync_group_members.state = 'active' THEN sync_group_members.authorization_id ELSE excluded.authorization_id END, " +
                "provisioning_cursor = CASE WHEN sync_group_members.state = 'active' THEN NULL ELSE excluded.provisioning_cursor END, " +
                "updated_at = excluded.updated_at", new Object[] {
                    groupId, request.deviceId, request.deviceKind, request.deviceName, config.getString("device_id"),
                    request.pairRequestId, cursor, now, now
                });
            return cursor;
        } finally { db.close(); }
    }

    static void assertProviderComplete(android.content.Context context, String path) throws Exception {
        FolioleCompanionSyncPackProviderDefinitions definitions = FolioleCompanionSyncPackProviderDefinitions.load(context);
        SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY);
        try {
            try (Cursor count = db.rawQuery(definitions.completenessQuery("missingContentBlobCount"), null)) {
                if (!count.moveToFirst() || count.getInt(0) != 0) throw new IllegalStateException("sync_group_provider_incomplete");
            }
            try (Cursor rows = db.rawQuery(definitions.completenessQuery("attachments"), null)) {
                while (rows.moveToNext()) {
                    if (rows.isNull(1)) throw new IllegalStateException("sync_group_provider_incomplete");
                    String storageKey = rows.getString(1); String contentHash = rows.getString(2);
                    if (!contentHash.matches("[a-f0-9]{64}") || !contentHash.equals(storageKey)) {
                        throw new IllegalStateException("sync_group_provider_incomplete");
                    }
                    File file = new File(new File(context.getFilesDir(), "attachments"), storageKey);
                    if (!file.isFile() || !contentHash.equals(FolioleCompanionAttachmentResourceHash.digestHex(context, file))) {
                        throw new IllegalStateException("sync_group_provider_incomplete");
                    }
                }
            }
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
                    "authorization_id, joined_at, activated_at FROM sync_group_members WHERE state != 'left' ORDER BY joined_at, device_id", null)) {
                while (rows.moveToNext()) members.put(new JSONObject().put("device_id", rows.getString(0))
                    .put("device_kind", rows.getString(1)).put("device_name", rows.getString(2)).put("state", rows.getString(3))
                    .put("approved_by_device_id", rows.getString(4)).put("authorization_id", rows.getString(5))
                    .put("joined_at", rows.getString(6)).put("activated_at", rows.isNull(7) ? JSONObject.NULL : rows.getString(7)));
            }
            String state = "provisioning";
            for (int index = 0; index < members.length(); index++) {
                JSONObject member = members.getJSONObject(index);
                if (localDeviceId.equals(member.getString("device_id"))) state = member.getString("state");
            }
            return group.put("local_member_state", state).put("members", members);
        } finally { db.close(); }
    }

    static String memberAuthorizationId(JSONObject group, String deviceId) throws Exception {
        JSONArray members = group.getJSONArray("members");
        for (int index = 0; index < members.length(); index++) {
            JSONObject member = members.getJSONObject(index);
            if (deviceId.equals(member.getString("device_id"))) return member.getString("authorization_id");
        }
        throw new IllegalStateException("sync_group_member_not_authorized");
    }

    static void activate(String path, String deviceId, String authorizationId, int completedCursor) {
        SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE);
        try {
            String now = Instant.now().toString();
            db.execSQL("UPDATE sync_group_members SET state = 'active', activated_at = COALESCE(activated_at, ?), updated_at = ? " +
                "WHERE device_id = ? AND authorization_id = ? AND ? >= COALESCE(provisioning_cursor, 0)",
                new Object[] { now, now, deviceId, authorizationId, completedCursor });
            try (Cursor changes = db.rawQuery("SELECT changes()", null)) {
                if (!changes.moveToFirst() || changes.getInt(0) != 1) throw new IllegalStateException("sync_group_member_not_authorized");
            }
        } finally { db.close(); }
    }

    static void recordSupplyCursor(String path, String peerId, int fromCursor, int toCursor) {
        SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE);
        try {
            db.execSQL("INSERT OR REPLACE INTO sync_peer_cursors (peer_id, stream_name, cursor_value, updated_at) VALUES (?, ?, ?, ?)",
                new Object[] { peerId, "sync-pack-supply", fromCursor + ":" + toCursor, Instant.now().toString() });
        } finally { db.close(); }
    }

    static void saveSyncEndpoint(String path, String endpointUrl, String now) {
        SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE);
        try {
            db.execSQL("INSERT OR REPLACE INTO companion_meta (key, value, updated_at) VALUES ('workspace_sync_endpoint_url', ?, ?)",
                new Object[] { endpointUrl, now });
        } finally { db.close(); }
    }

    static int maxStateSeq(String path) {
        SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY);
        try { return maxStateSeq(db); } finally { db.close(); }
    }

    private static int maxStateSeq(SQLiteDatabase db) {
        try (Cursor cursor = db.rawQuery("SELECT COALESCE(MAX(state_seq), 0) FROM sync_object_state", null)) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }
}
