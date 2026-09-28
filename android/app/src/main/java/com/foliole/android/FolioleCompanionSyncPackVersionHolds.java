package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

final class FolioleCompanionSyncPackVersionHolds {
    private FolioleCompanionSyncPackVersionHolds() {}

    static JSONObject read(SQLiteDatabase pack, String packId, String peer) throws Exception {
        JSONArray heads = new JSONArray();
        JSONArray payloads = new JSONArray();
        try (Cursor cursor = pack.rawQuery(
            "SELECT id, current_version_id FROM nodes WHERE current_version_id IS NOT NULL", null)) {
            while (cursor.moveToNext()) heads.put(new JSONObject()
                .put("object_id", cursor.getString(0)).put("version_id", cursor.getString(1)));
        }
        try (Cursor cursor = pack.rawQuery(
            "SELECT object_id, version_id, body_text, snapshot_json FROM node_sync_versions", null)) {
            while (cursor.moveToNext()) {
                JSONObject snapshot = new JSONObject(cursor.getString(3));
                if (cursor.isNull(2) && snapshot.has("content") && snapshot.isNull("content")) continue;
                payloads.put(new JSONObject()
                    .put("object_id", cursor.getString(0)).put("version_id", cursor.getString(1)));
            }
        }
        return new JSONObject().put("pack_id", packId).put("peer_id", peer)
            .put("heads", heads).put("payloads", payloads);
    }
}
