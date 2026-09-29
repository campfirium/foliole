package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Reads only the selected node ancestry from an immutable provider snapshot. */
final class FolioleCompanionSyncPackDependencyRows {
    private FolioleCompanionSyncPackDependencyRows() {}

    static Set<String> held(JSONArray facts, String bits, String key) throws Exception {
        int count = facts.length();
        if (bits == null || !bits.matches("[0-9a-f]*") || bits.length() != ((count + 7) / 8) * 2) {
            throw new IllegalArgumentException("sync_pack_fact_claims_invalid");
        }
        Set<String> result = new HashSet<>();
        for (int i = 0; i < count; i++) {
            int byteValue = Integer.parseInt(bits.substring(i / 8 * 2, i / 8 * 2 + 2), 16);
            if ((byteValue & (1 << (i % 8))) == 0) continue;
            JSONObject fact = facts.getJSONObject(i);
            result.add(key != null ? fact.getString(key) : new JSONArray()
                .put(fact.getString("version_id")).put(fact.getString("parent_version_id"))
                .put(fact.getInt("ordinal")).toString());
        }
        return result;
    }

    static void each(SQLiteDatabase db, JSONObject transfer, List<String> nodeIds,
            Set<String> heldVersions, Set<String> heldParents, Set<String> heldReviews,
            FolioleCompanionSyncPackFactClaims pagedClaims,
            RowConsumer consumer) throws Exception {
        String placeholders = String.join(",", java.util.Collections.nCopies(nodeIds.size(), "?"));
        String[] ids = nodeIds.toArray(new String[0]);
        String versions = "SELECT version_id, object_id, parent_version_id, host_name, " +
            "created_at, content_hash, body_text, snapshot_json FROM node_sync_versions " +
            "WHERE object_id IN (" + placeholders + ") ORDER BY version_id";
        if (!scan(db, versions, ids, "node_sync_versions", heldVersions, pagedClaims, consumer)) return;
        String parents = "SELECT p.version_id, p.parent_version_id, p.ordinal " +
            "FROM node_sync_version_parents p JOIN node_sync_versions v ON v.version_id = p.version_id " +
            "WHERE v.object_id IN (" + placeholders + ") AND p.parent_version_id IN " +
            "(SELECT version_id FROM node_sync_versions WHERE object_id IN (" + placeholders + ")) " +
            "ORDER BY p.version_id,p.ordinal";
        String[] parentIds = new String[ids.length * 2];
        System.arraycopy(ids, 0, parentIds, 0, ids.length);
        System.arraycopy(ids, 0, parentIds, ids.length, ids.length);
        if (!scan(db, parents, parentIds, "node_sync_version_parents", heldParents, pagedClaims, consumer)) return;
        if ("node_review".equals(transfer.getString("objectType"))) {
            String reviews = "SELECT op_id,id,host_name,node_id,grade,scheduler_version," +
                "reviewed_at,due_before,stability_before,difficulty_before,due_after," +
                "stability_after,difficulty_after FROM review_log WHERE node_id = ? ORDER BY op_id";
            scan(db, reviews, new String[] { transfer.getString("objectId") },
                "review_log", heldReviews, pagedClaims, consumer);
        }
    }

    private static boolean scan(SQLiteDatabase db, String sql, String[] params, String table,
            Set<String> held, FolioleCompanionSyncPackFactClaims pagedClaims,
            RowConsumer consumer) throws Exception {
        try (Cursor cursor = db.rawQuery(sql, params)) {
            while (cursor.moveToNext()) {
                String key = cursor.getString(0);
                int ordinal = table.equals("node_sync_version_parents") ? cursor.getInt(2) : -1;
                String claimKey = table.equals("node_sync_version_parents")
                    ? new JSONArray().put(key).put(cursor.getString(1)).put(ordinal).toString() : key;
                if (held.contains(claimKey) || pagedClaims != null && pagedClaims.contains(table, claimKey)) continue;
                JSONObject payload = new JSONObject();
                String[] columns = table.equals("node_sync_versions")
                    ? new String[] { "version_id", "object_id", "parent_version_id", "host_name",
                        "created_at", "content_hash", "body_text", "snapshot_json" }
                    : table.equals("node_sync_version_parents")
                        ? new String[] { "version_id", "parent_version_id", "ordinal" }
                        : new String[] { "op_id", "id", "host_name", "node_id", "grade",
                            "scheduler_version", "reviewed_at", "due_before", "stability_before",
                            "difficulty_before", "due_after", "stability_after", "difficulty_after" };
                for (int i = 0; i < columns.length; i++) payload.put(columns[i], cursor.isNull(i)
                    ? JSONObject.NULL : table.equals("node_sync_version_parents") && i == 2 ||
                        table.equals("review_log") && i == 4 ? cursor.getInt(i) :
                        table.equals("review_log") && (i == 8 || i == 9 || i == 11 || i == 12)
                            ? cursor.getDouble(i) : cursor.getString(i));
                JSONObject row = new JSONObject().put("table", table)
                    .put("key", new JSONObject().put("key", key).put("ordinal", ordinal))
                    .put("json", payload.toString().replace("\\/", "/"));
                if (!consumer.accept(row)) return false;
            }
        }
        return true;
    }

    interface RowConsumer { boolean accept(JSONObject row) throws Exception; }
}
