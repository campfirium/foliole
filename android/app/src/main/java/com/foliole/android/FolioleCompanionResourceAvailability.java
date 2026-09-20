package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.FileNotFoundException;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;

final class FolioleCompanionResourceAvailability {
    private FolioleCompanionResourceAvailability() {}

    static JSONObject reply(Context context, String snapshot, String body, String deviceId) throws Exception {
        JSONArray needs = new JSONObject(body).getJSONArray("resources");
        if (needs.length() > 32) throw new IllegalArgumentException("resource_availability_invalid_request");
        JSONArray claims = new JSONArray();
        Set<String> seen = new HashSet<>();
        for (int index = 0; index < needs.length(); index++) {
            JSONObject need = needs.getJSONObject(index);
            String kind = need.getString("kind"), id = need.getString("id");
            if ((!kind.equals("attachment") && !kind.equals("content_blob")) || !id.matches("[a-f0-9]{64}")
                || !seen.add(kind + ":" + id)) throw new IllegalArgumentException("resource_availability_invalid_request");
            claims.put(inspect(context, snapshot, kind, id));
        }
        return new JSONObject().put("provider_device_id", deviceId).put("resources", claims);
    }

    private static JSONObject inspect(Context context, String snapshot, String kind, String id) throws Exception {
        JSONObject claim = new JSONObject().put("kind", kind).put("id", id).put("status", "missing");
        FolioleCompanionSyncGroupResources.Resource resource;
        try {
            resource = kind.equals("attachment")
                ? FolioleCompanionSyncGroupResources.attachment(context, snapshot, id, id)
                : FolioleCompanionSyncGroupResources.contentBlob(snapshot, id);
        } catch (FileNotFoundException error) { return claim; }
        if (resource == null) return claim;
        String expectedHash = id;
        long expectedSize = resource.body.length;
        if (kind.equals("content_blob")) {
            SQLiteDatabase db = SQLiteDatabase.openDatabase(snapshot, null, SQLiteDatabase.OPEN_READONLY);
            try (Cursor row = db.rawQuery("SELECT stored_sha256, stored_size_bytes FROM content_blobs WHERE hash = ?", new String[] { id })) {
                if (!row.moveToFirst()) return claim;
                expectedHash = row.getString(0); expectedSize = row.getLong(1);
            } finally { db.close(); }
        }
        String actualHash = digest(resource.body);
        if (!actualHash.equals(expectedHash) || resource.body.length != expectedSize) return claim.put("status", "checksum_mismatch");
        return claim.put("status", "available").put("sha256", actualHash).put("size_bytes", resource.body.length);
    }

    static String digest(byte[] bytes) throws Exception {
        StringBuilder value = new StringBuilder();
        for (byte item : MessageDigest.getInstance("SHA-256").digest(bytes)) value.append(String.format("%02x", item));
        return value.toString();
    }
}
