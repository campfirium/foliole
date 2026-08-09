package com.foliole.android;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class FolioleCompanionSyncGroupContentBlobBatch {
    private static final int MAX_BATCH_SIZE = 32;

    private FolioleCompanionSyncGroupContentBlobBatch() {}

    static Result load(String databasePath, String bodyText) throws Exception {
        JSONArray requested = new JSONObject(bodyText).optJSONArray("hashes");
        if (requested == null || requested.length() > MAX_BATCH_SIZE) {
            throw new IllegalArgumentException("invalid_hashes");
        }
        List<String> hashes = validatedHashes(requested);
        Map<String, Entry> entries = loadEntries(databasePath, hashes);
        String boundary = "foliole-content-blobs-" + String.join("", hashes).substring(0, Math.min(24, hashes.size() * 64));
        return new Result(encode(hashes, entries, boundary), "multipart/mixed; boundary=" + boundary);
    }

    private static List<String> validatedHashes(JSONArray values) throws Exception {
        List<String> hashes = new ArrayList<>();
        for (int index = 0; index < values.length(); index++) {
            String hash = values.optString(index, "").toLowerCase();
            if (!hash.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("invalid_hashes");
            hashes.add(hash);
        }
        return hashes;
    }

    private static Map<String, Entry> loadEntries(String path, List<String> hashes) {
        Map<String, Entry> entries = new HashMap<>();
        if (hashes.isEmpty()) return entries;
        String placeholders = String.join(",", java.util.Collections.nCopies(hashes.size(), "?"));
        SQLiteDatabase db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY);
        try (Cursor rows = db.rawQuery(
            "SELECT cb.hash, cb.mime_type, cbd.data FROM content_blobs cb " +
                "JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cb.hash IN (" + placeholders + ")",
            hashes.toArray(new String[0]))) {
            while (rows.moveToNext()) entries.put(rows.getString(0),
                new Entry(rows.isNull(1) ? "application/octet-stream" : rows.getString(1), rows.getBlob(2)));
            return entries;
        } finally { db.close(); }
    }

    private static byte[] encode(List<String> hashes, Map<String, Entry> entries, String boundary) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        for (String hash : hashes) {
            Entry entry = entries.get(hash);
            if (entry == null) continue;
            write(output, "--" + boundary + "\r\nContent-Type: " + entry.mimeType + "\r\nContent-Length: " +
                entry.body.length + "\r\nX-Blob-Hash: " + hash + "\r\n\r\n");
            output.write(entry.body);
            write(output, "\r\n");
        }
        write(output, "--" + boundary + "--\r\n");
        return output.toByteArray();
    }

    private static void write(ByteArrayOutputStream output, String value) throws Exception {
        output.write(value.getBytes(StandardCharsets.UTF_8));
    }

    private static final class Entry {
        final byte[] body;
        final String mimeType;
        Entry(String mimeType, byte[] body) { this.mimeType = mimeType; this.body = body; }
    }

    static final class Result {
        final byte[] body;
        final String mimeType;
        Result(byte[] body, String mimeType) { this.body = body; this.mimeType = mimeType; }
    }
}
