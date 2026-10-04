package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.Base64;
import org.json.JSONObject;

/** Writes fixed-size original fact JSON bytes into the existing pack metadata table. */
final class FolioleCompanionIdentityFactChunkWriter {
    static boolean copy(SQLiteDatabase pack, JSONObject facts, JSONObject plan) throws Exception {
        try (Cursor row = pack.rawQuery(plan.getString("metadataSql"), null)) {
            if (!row.moveToFirst()) {
                if (facts.has("chunk")) throw invalid();
                return false;
            }
            String key = row.getString(0);
            long total = row.getLong(1);
            if (!facts.has("chunk") && total <= 262144) return false;
            JSONObject request = facts.optJSONObject("chunk");
            long offset = request == null ? 0 : request.getLong("offset");
            if (offset < 0 || offset >= total || request != null &&
                (!request.getString("key").equals(key) || request.getLong("total") != total)) throw invalid();
            pack.execSQL("UPDATE selected_identity_fact SET chunk_offset = ?", new Object[] { offset });
            byte[] bytes;
            try (Cursor data = pack.rawQuery(plan.getString("chunkSql"), null)) {
                if (!data.moveToFirst()) throw invalid();
                bytes = data.getBlob(0);
            }
            if (bytes.length != Math.min(262144L, total - offset)) throw invalid();
            JSONObject payload = new JSONObject().put("key", key).put("offset", offset)
                .put("total", total).put("data_base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
            pack.execSQL("INSERT INTO pack_manifest (key, value) VALUES ('fact_chunk', ?)",
                new Object[] { payload.toString() });
            long nextOffset = offset + bytes.length;
            JSONObject tail = new JSONObject().put("nextAfter", nextOffset < total ? facts.get("after") :
                row.getInt(2) == 1 ? key : JSONObject.NULL);
            if (nextOffset < total) tail.put("chunk", new JSONObject().put("key", key)
                .put("nextOffset", nextOffset).put("total", total));
            saveTail(pack, tail);
            return true;
        }
    }

    static void saveTail(SQLiteDatabase pack, JSONObject tail) {
        pack.execSQL("INSERT INTO pack_manifest (key, value) VALUES ('fact_tail', ?)",
            new Object[] { tail.toString() });
    }

    static JSONObject metadata(SQLiteDatabase pack) throws Exception {
        try (Cursor row = pack.rawQuery("SELECT json_extract(value, '$.key'), " +
            "json_extract(value, '$.offset'), json_extract(value, '$.total') " +
            "FROM pack_manifest WHERE key = 'fact_chunk'", null)) {
            return row.moveToFirst() ? new JSONObject().put("key", row.getString(0))
                .put("offset", row.getLong(1)).put("total", row.getLong(2)) : null;
        }
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("sync_identity_fact_chunk_source_mismatch");
    }
}
