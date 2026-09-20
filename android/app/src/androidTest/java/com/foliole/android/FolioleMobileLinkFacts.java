package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

final class FolioleMobileLinkFacts {
    final String groupId;
    final List<String> topics;

    private FolioleMobileLinkFacts(String groupId, List<String> topics) {
        this.groupId = groupId;
        this.topics = topics;
    }

    static FolioleMobileLinkFacts read(Context context) {
        String path = context.getDatabasePath("foliole-companionSQLite.db").getAbsolutePath();
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY)) {
            String group;
            try (Cursor cursor = db.rawQuery(
                "SELECT group_id FROM sync_group_local_state WHERE singleton_id=1 AND state='active'", null)) {
                if (!cursor.moveToFirst()) throw new IllegalStateException("A local test Sync Group is required.");
                group = cursor.getString(0);
            }
            List<String> topics = new ArrayList<>();
            try (Cursor cursor = db.rawQuery(
                "WITH RECURSIVE hidden(id) AS (SELECT id FROM nodes WHERE deleted_at IS NOT NULL " +
                "UNION SELECT n.id FROM nodes n JOIN hidden h ON n.parent_id=h.id) " +
                "SELECT id FROM nodes WHERE kind='topic' AND id NOT IN (SELECT id FROM hidden) " +
                "AND (length(trim(content))>0 OR body_blob_hash IS NOT NULL) ORDER BY id LIMIT 2", null)) {
                while (cursor.moveToNext()) topics.add(cursor.getString(0));
            }
            if (topics.size() < 2) throw new IllegalStateException("Two readable local test topics are required.");
            return new FolioleMobileLinkFacts(group, topics);
        }
    }

    static String protectedFingerprint(Context context) throws Exception {
        String path = context.getDatabasePath("foliole-companionSQLite.db").getAbsolutePath();
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY)) {
            for (String table : new String[] { "nodes", "node_order", "attachments", "node_attachments",
                "content_blobs", "content_blob_data", "sync_groups", "sync_group_devices", "sync_group_local_state",
                "node_reading", "node_review", "review_log", "setting_records", "external_documents",
                "node_sync_versions", "node_sync_conflicts", "node_sync_tombstones" }) {
                List<String> rows = new ArrayList<>();
                try (Cursor cursor = db.rawQuery("SELECT * FROM " + table, null)) {
                    while (cursor.moveToNext()) {
                        org.json.JSONArray row = new org.json.JSONArray();
                        for (int index = 0; index < cursor.getColumnCount(); index++) {
                            if (cursor.getType(index) == Cursor.FIELD_TYPE_BLOB) {
                                row.put(android.util.Base64.encodeToString(cursor.getBlob(index), android.util.Base64.NO_WRAP));
                            } else {
                                row.put(cursor.isNull(index) ? org.json.JSONObject.NULL : cursor.getString(index));
                            }
                        }
                        rows.add(row.toString());
                    }
                }
                Collections.sort(rows);
                digest.update((table + rows.toString()).getBytes(StandardCharsets.UTF_8));
            }
        }
        StringBuilder result = new StringBuilder();
        for (byte value : digest.digest()) result.append(String.format("%02x", value & 0xff));
        return result.toString();
    }

    String link(String topicId) {
        return new Uri.Builder().scheme("foliole").authority("node").path("/v1")
            .appendQueryParameter("group", groupId).appendQueryParameter("id", topicId).build().toString();
    }
}
