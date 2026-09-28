package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class FolioleCompanionSyncPackFactIndex {
    private FolioleCompanionSyncPackFactIndex() {}

    static JSONObject read(SQLiteDatabase pack, int from, int to, int frontier, String epoch) throws Exception {
        JSONArray versions = new JSONArray();
        try (Cursor rows = pack.rawQuery(
            "SELECT version_id, object_id, parent_version_id, host_name, created_at, " +
            "content_hash, body_text, snapshot_json, json_remove(snapshot_json, '$.content') " +
            "FROM node_sync_versions ORDER BY object_id, created_at, version_id", null)) {
            while (rows.moveToNext()) {
                JSONObject snapshot = new JSONObject(rows.getString(7));
                String body = rows.isNull(6) ? (snapshot.has("content")
                    ? (snapshot.isNull("content") ? null : snapshot.getString("content")) : "") : rows.getString(6);
                versions.put(new JSONObject()
                    .put("version_id", rows.getString(0)).put("object_id", rows.getString(1))
                    .put("parent_version_id", rows.isNull(2) ? JSONObject.NULL : rows.getString(2))
                    .put("host_name", rows.getString(3)).put("created_at", rows.getString(4))
                    .put("content_hash", rows.getString(5))
                    .put("body_hash", body == null ? JSONObject.NULL : sha(body))
                    .put("snapshot_metadata", rows.getString(8)));
            }
        }
        JSONArray parents = new JSONArray();
        try (Cursor rows = pack.rawQuery("SELECT version_id, parent_version_id, ordinal " +
            "FROM node_sync_version_parents ORDER BY version_id, ordinal", null)) {
            while (rows.moveToNext()) parents.put(new JSONObject()
                .put("version_id", rows.getString(0)).put("parent_version_id", rows.getString(1))
                .put("ordinal", rows.getInt(2)));
        }
        JSONArray reviews = new JSONArray();
        String[] columns = { "id", "op_id", "host_name", "node_id", "grade", "scheduler_version",
            "reviewed_at", "due_before", "stability_before", "difficulty_before",
            "due_after", "stability_after", "difficulty_after" };
        try (Cursor rows = pack.rawQuery("SELECT " + String.join(", ", columns) +
            " FROM review_log ORDER BY reviewed_at, op_id", null)) {
            while (rows.moveToNext()) {
                JSONObject review = new JSONObject();
                for (int column = 0; column < columns.length; column++) {
                    Object value = rows.isNull(column) ? JSONObject.NULL :
                        (column == 4 ? rows.getInt(column) :
                         column == 8 || column == 9 || column == 11 || column == 12
                            ? rows.getDouble(column) : rows.getString(column));
                    review.put(columns[column], value);
                }
                reviews.put(review);
            }
        }
        if (versions.length() > 128 || parents.length() > 128 || reviews.length() > 128) {
            throw new IllegalArgumentException("sync_pack_fact_index_over_budget");
        }
        JSONObject index = new JSONObject().put("from_state_seq", from).put("to_state_seq", to)
            .put("frontier_state_seq", frontier).put("source_epoch", epoch)
            .put("versions", versions).put("parents", parents).put("reviews", reviews);
        if (index.toString().getBytes(StandardCharsets.UTF_8).length > 256 * 1024) {
            throw new IllegalArgumentException("sync_pack_fact_index_over_budget");
        }
        index.put("index_id", sha(index.toString()));
        return index;
    }

    static void retainMissing(SQLiteDatabase pack, JSONObject index,
                              String expectedId, String versionBits, String parentBits, String reviewBits) throws Exception {
        if (!index.getString("index_id").equals(expectedId)) {
            throw new IllegalArgumentException("sync_pack_fact_index_changed");
        }
        JSONArray versions = index.getJSONArray("versions");
        JSONArray parents = index.getJSONArray("parents");
        JSONArray reviews = index.getJSONArray("reviews");
        boolean[] heldVersions = bits(versionBits, versions.length());
        boolean[] heldParents = bits(parentBits, parents.length());
        boolean[] heldReviews = bits(reviewBits, reviews.length());
        for (int i = 0; i < versions.length(); i++) {
            if (!heldVersions[i] && versions.getJSONObject(i).isNull("body_hash")) {
                throw new IllegalArgumentException("sync_pack_fact_body_unavailable:" +
                    versions.getJSONObject(i).getString("version_id"));
            }
        }
        pack.beginTransaction();
        try {
            for (int i = 0; i < versions.length(); i++) if (heldVersions[i]) {
                pack.execSQL("DELETE FROM node_sync_versions WHERE version_id = ?",
                    new Object[] { versions.getJSONObject(i).getString("version_id") });
            }
            for (int i = 0; i < parents.length(); i++) if (heldParents[i]) {
                JSONObject edge = parents.getJSONObject(i);
                pack.execSQL("DELETE FROM node_sync_version_parents WHERE version_id = ? " +
                    "AND parent_version_id = ? AND ordinal = ?", new Object[] {
                        edge.getString("version_id"), edge.getString("parent_version_id"), edge.getInt("ordinal") });
            }
            for (int i = 0; i < reviews.length(); i++) if (heldReviews[i]) {
                pack.execSQL("DELETE FROM review_log WHERE op_id = ?",
                    new Object[] { reviews.getJSONObject(i).getString("op_id") });
            }
            pack.setTransactionSuccessful();
        } finally { pack.endTransaction(); }
        pack.execSQL("VACUUM");
    }

    private static boolean[] bits(String hex, int count) {
        if (hex == null || hex.length() != ((count + 7) / 8) * 2 || !hex.matches("[0-9a-f]*")) {
            throw new IllegalArgumentException("sync_pack_fact_claims_invalid");
        }
        boolean[] held = new boolean[count];
        for (int index = 0; index < count; index++) {
            int value = Integer.parseInt(hex.substring((index / 8) * 2, (index / 8) * 2 + 2), 16);
            held[index] = (value & (1 << (index % 8))) != 0;
        }
        if (count % 8 != 0 && count > 0) {
            int last = Integer.parseInt(hex.substring(hex.length() - 2), 16);
            if ((last >> (count % 8)) != 0) throw new IllegalArgumentException("sync_pack_fact_claims_invalid");
        }
        return held;
    }

    private static String sha(String text) throws Exception {
        byte[] bytes = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) hex.append(String.format("%02x", value & 0xff));
        return hex.toString();
    }
}
