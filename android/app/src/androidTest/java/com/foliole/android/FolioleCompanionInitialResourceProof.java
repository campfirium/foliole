package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.file.Files;

final class FolioleCompanionInitialResourceProof {
    private FolioleCompanionInitialResourceProof() {}

    static JSONObject read(Context context, JSONObject projection, String groupId,
        String nodeId, String availableHash, String recoveringHash, boolean partial
    ) throws Exception {
        if (!availableHash.matches("[a-f0-9]{64}") || !recoveringHash.matches("[a-f0-9]{64}")) {
            throw new IllegalStateException("Initial resource fixture hashes are invalid");
        }
        File attachmentDir = new File(context.getFilesDir(), "attachments");
        File available = new File(attachmentDir, availableHash + ".png");
        File recovering = new File(attachmentDir, recoveringHash + ".png");
        JSONArray missing = new JSONArray();
        boolean demanded;
        boolean structureComplete;
        boolean bodyReady;
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(
            context.getDatabasePath("foliole-companionSQLite.db").getPath(), null,
            SQLiteDatabase.OPEN_READONLY
        )) {
            demanded = count(db, "SELECT COUNT(*) FROM sync_pack_resource_articles " +
                "WHERE group_id=? AND article_id=?", groupId, nodeId) > 0;
            structureComplete = count(db, "SELECT COUNT(*) FROM sync_pack_receive_progress " +
                "WHERE group_id=? AND completed=1 AND cursor_state_seq=frontier_state_seq",
                groupId) > 0;
            bodyReady = count(db, "SELECT COUNT(*) FROM nodes n LEFT JOIN content_blob_data cbd " +
                "ON cbd.hash=n.body_blob_hash WHERE n.id=? AND n.deleted_at IS NULL " +
                "AND (cbd.hash IS NOT NULL OR (n.body_blob_hash IS NULL AND " +
                "instr(n.content, 'Resource LAN body remains readable.')>0))", nodeId) == 1;
            try (Cursor rows = db.rawQuery("SELECT DISTINCT a.id FROM attachments a " +
                "JOIN node_attachments na ON na.attachment_id=a.id " +
                "JOIN nodes n ON n.id=na.node_id WHERE n.deleted_at IS NULL", null)) {
                while (rows.moveToNext()) {
                    String hash = rows.getString(0);
                    File[] files = attachmentDir.listFiles((dir, name) -> name.startsWith(hash + "."));
                    if (files == null || files.length == 0) missing.put(hash);
                }
            }
        }
        boolean availableReady = available.isFile() && availableHash.equals(
            FolioleCompanionResourceAvailability.digest(Files.readAllBytes(available.toPath())));
        boolean recoveringAbsent = !recovering.exists();
        boolean clean = projection.getJSONArray("dirty_objects").length() == 0
            && projection.getJSONArray("unconfirmed_deliveries").length() == 0
            && projection.getJSONArray("push_issues").length() == 0;
        JSONObject proof = new JSONObject().put("nodeId", nodeId)
            .put("availableHash", availableHash).put("recoveringHash", recoveringHash)
            .put("demanded", demanded).put("structureComplete", structureComplete)
            .put("bodyReady", bodyReady).put("availableReady", availableReady)
            .put("recoveringAbsent", recoveringAbsent).put("missingAttachmentHashes", missing)
            .put("clean", clean);
        if (!structureComplete || !bodyReady || !availableReady || !recoveringAbsent || !clean
            || (partial && (!demanded || missing.length() != 1
                || !recoveringHash.equals(missing.optString(0))))
            || (!partial && demanded)) {
            throw new IllegalStateException("Initial resource attribution failed: " + proof);
        }
        return proof;
    }

    private static int count(SQLiteDatabase db, String sql, String... args) {
        try (Cursor cursor = db.rawQuery(sql, args)) {
            if (!cursor.moveToFirst()) throw new IllegalStateException("Count query returned no row");
            return cursor.getInt(0);
        }
    }
}
