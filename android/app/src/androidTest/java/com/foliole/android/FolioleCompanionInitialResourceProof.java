package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.file.Files;
import java.util.HashSet;
import java.util.Set;

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
        boolean nodeCommitted;
        Set<String> fixtureKeys = new HashSet<>();
        boolean bodyReady;
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(
            context.getDatabasePath("foliole-companionSQLite.db").getPath(), null,
            SQLiteDatabase.OPEN_READONLY
        )) {
            nodeCommitted = count(db, "SELECT COUNT(*) FROM nodes n " +
                "JOIN node_sync_versions v ON v.object_id=n.id AND v.version_id=n.current_version_id " +
                "JOIN sync_group_local_state l ON l.state='active' " +
                "WHERE n.id=? AND l.group_id=? AND n.deleted_at IS NULL " +
                "AND NOT EXISTS (SELECT 1 FROM node_sync_versions h WHERE h.object_id=n.id " +
                "AND h.version_id<>n.current_version_id AND NOT EXISTS " +
                "(SELECT 1 FROM node_sync_version_parents e WHERE e.parent_version_id=h.version_id))",
                nodeId, groupId) == 1;
            bodyReady = count(db, "SELECT COUNT(*) FROM nodes n WHERE n.id=? " +
                "AND n.deleted_at IS NULL " +
                "AND instr(n.content, 'Resource LAN body remains readable.')>0", nodeId) == 1;
            collectMissing(db, attachmentDir, nodeId, fixtureKeys, missing);
        }
        boolean availableReady = available.isFile() && availableHash.equals(
            FolioleCompanionResourceAvailability.digest(Files.readAllBytes(available.toPath())));
        boolean recoveringAbsent = !recovering.exists();
        // Legacy dirty flags and delivery receipts are not request-sync completion evidence.
        // Foreground usage can also create new facts after the initial round has finished.
        JSONObject proof = new JSONObject().put("nodeId", nodeId)
            .put("availableHash", availableHash).put("recoveringHash", recoveringHash)
            .put("nodeCommitted", nodeCommitted).put("fixtureKeys", new JSONArray(fixtureKeys))
            .put("bodyReady", bodyReady).put("availableReady", availableReady)
            .put("recoveringAbsent", recoveringAbsent).put("missingAttachmentHashes", missing)
            .put("legacyDirtyObjects", projection.getJSONArray("dirty_objects"));
        if (!nodeCommitted || fixtureKeys.size() != 2
            || !fixtureKeys.contains(availableHash + ".png") || !fixtureKeys.contains(recoveringHash + ".png")
            || !bodyReady || !availableReady || (partial && !recoveringAbsent)
            || (partial && (missing.length() != 1
                || !recoveringHash.equals(missing.optString(0))))
            || (!partial && missing.length() != 0)) {
            throw new IllegalStateException("Initial resource attribution failed: " + proof);
        }
        return proof;
    }

    private static void collectMissing(SQLiteDatabase db, File attachmentDir, String nodeId,
        Set<String> fixtureKeys, JSONArray missing) throws Exception {
        Set<String> missingKeys = new HashSet<>();
        try (Cursor rows = db.rawQuery("SELECT id, resource_references FROM nodes " +
            "WHERE deleted_at IS NULL", null)) {
            while (rows.moveToNext()) {
                JSONArray references = new JSONArray(rows.getString(1));
                for (int index = 0; index < references.length(); index++) {
                    String key = references.getJSONObject(index).getString("storage_key");
                    if (!FolioleCompanionCanonicalAttachmentKey.valid(key)) {
                        throw new IllegalStateException("Invalid current resource key: " + key);
                    }
                    if (nodeId.equals(rows.getString(0))) fixtureKeys.add(key);
                    if (!new File(attachmentDir, key).isFile() && missingKeys.add(key)) {
                        missing.put(key.substring(0, 64));
                    }
                }
            }
        }
    }

    private static int count(SQLiteDatabase db, String sql, String... args) {
        try (Cursor cursor = db.rawQuery(sql, args)) {
            if (!cursor.moveToFirst()) throw new IllegalStateException("Count query returned no row");
            return cursor.getInt(0);
        }
    }
}
