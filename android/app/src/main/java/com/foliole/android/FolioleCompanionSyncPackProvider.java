package com.foliole.android;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.UUID;
import java.util.zip.CRC32;
import java.util.zip.DeflaterOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

final class FolioleCompanionSyncPackProvider {
    private FolioleCompanionSyncPackProvider() {}

    static BuildResult build(Context context, String snapshotPath, String fromPeerId, String toPeerId, int fromSeq) throws Exception {
        FolioleCompanionSyncPackProviderDefinitions definitions = FolioleCompanionSyncPackProviderDefinitions.load(context);
        File packDbFile = File.createTempFile("foliole-provider-", ".db", context.getCacheDir());
        String packId = UUID.randomUUID().toString();
        SQLiteDatabase pack = SQLiteDatabase.openOrCreateDatabase(packDbFile, null);
        int toSeq;
        JSONObject holds;
        try {
            toSeq = createPack(pack, definitions, snapshotPath, fromSeq);
            holds = versionHolds(pack, packId, toPeerId);
            JSONObject tables = tableManifest(pack, definitions.tableNames());
            JSONObject inner = innerManifest(packId, fromSeq, toSeq, tables.getJSONArray("tables"));
            pack.execSQL("INSERT INTO pack_manifest (key, value) VALUES ('manifest_json', ?)", new Object[] { inner.toString() });
        } finally { pack.close(); }
        try {
            byte[] database = readAll(packDbFile);
            byte[] compressed = deflate(database);
            JSONObject manifest = outerManifest(definitions, packId, fromPeerId, toPeerId, fromSeq, toSeq,
                tableManifest(packDbFile, definitions.tableNames()).getJSONArray("tables"), database, compressed);
            return new BuildResult(zip(manifest, definitions.databaseEntry(), compressed), toSeq, holds);
        } finally { if (!packDbFile.delete()) packDbFile.deleteOnExit(); }
    }

    private static JSONObject versionHolds(SQLiteDatabase pack, String packId, String peer) throws Exception {
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

    private static int createPack(SQLiteDatabase pack, FolioleCompanionSyncPackProviderDefinitions definitions,
                                  String snapshotPath, int fromSeq) throws Exception {
        pack.execSQL("ATTACH DATABASE ? AS source", new Object[] { snapshotPath });
        try {
            pack.execSQL("BEGIN");
            int toSeq = maxStateSeq(pack, "source.");
            JSONArray schema = definitions.packSchema();
            for (int index = 0; index < schema.length(); index++) pack.execSQL(schema.getString(index));
            JSONArray copies = definitions.copyStatements();
            for (int index = 0; index < copies.length(); index++) {
                if (index == definitions.stateCopyIndex()) {
                    pack.execSQL(copies.getString(index), new Object[] { fromSeq, toSeq });
                }
                else if (index == definitions.payloadCopyIndex()) {
                    FolioleCompanionSyncPackPayloadWriter.copy(pack, definitions.payloadPlans());
                    pack.execSQL(copies.getString(index));
                }
                else pack.execSQL(copies.getString(index));
            }
            pack.execSQL("COMMIT");
            return toSeq;
        } catch (Exception error) {
            if (pack.inTransaction()) pack.execSQL("ROLLBACK");
            throw error;
        } finally { pack.execSQL("DETACH DATABASE source"); }
    }

    private static int maxStateSeq(SQLiteDatabase source, String prefix) {
        try (Cursor cursor = source.rawQuery("SELECT COALESCE(MAX(state_seq), 0) FROM " + prefix + "sync_object_state", null)) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }

    private static JSONObject tableManifest(File path, JSONArray names) throws Exception {
        SQLiteDatabase db = SQLiteDatabase.openDatabase(path.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
        try { return tableManifest(db, names); } finally { db.close(); }
    }

    private static JSONObject tableManifest(SQLiteDatabase db, JSONArray names) throws Exception {
        JSONArray tables = new JSONArray();
        for (int index = 0; index < names.length(); index++) {
            String name = names.getString(index);
            try (Cursor cursor = db.rawQuery("SELECT COUNT(*) FROM \"" + name + "\"", null)) {
                tables.put(new JSONObject().put("name", name).put("row_count", cursor.moveToFirst() ? cursor.getInt(0) : 0));
            }
        }
        return new JSONObject().put("tables", tables);
    }

    private static JSONObject innerManifest(String id, int from, int to, JSONArray tables) throws Exception {
        return new JSONObject().put("pack_id", id).put("from_state_seq", from).put("to_state_seq", to).put("tables", tables);
    }

    private static JSONObject outerManifest(FolioleCompanionSyncPackProviderDefinitions definitions, String id,
            String fromPeer, String toPeer, int from, int to, JSONArray tables, byte[] database, byte[] compressed) throws Exception {
        return innerManifest(id, from, to, tables).put("format", definitions.format())
            .put("format_version", definitions.formatVersion()).put("from_peer_id", fromPeer)
            .put("to_peer_id", toPeer).put("schema_version", definitions.schemaVersion())
            .put("compression", "zlib").put("database_file", definitions.databaseEntry())
            .put("database_uncompressed_sha256", sha(database)).put("database_compressed_sha256", sha(compressed))
            .put("created_at", Instant.now().toString());
    }

    private static byte[] zip(JSONObject manifest, String databaseEntry, byte[] compressed) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            stored(zip, "manifest.json", manifest.toString(2).getBytes(StandardCharsets.UTF_8));
            stored(zip, databaseEntry, compressed);
        }
        return output.toByteArray();
    }

    private static void stored(ZipOutputStream zip, String name, byte[] body) throws Exception {
        CRC32 crc = new CRC32(); crc.update(body);
        ZipEntry entry = new ZipEntry(name); entry.setMethod(ZipEntry.STORED); entry.setSize(body.length); entry.setCompressedSize(body.length); entry.setCrc(crc.getValue());
        zip.putNextEntry(entry); zip.write(body); zip.closeEntry();
    }

    private static byte[] deflate(byte[] body) throws Exception { ByteArrayOutputStream out = new ByteArrayOutputStream(); try (DeflaterOutputStream stream = new DeflaterOutputStream(out)) { stream.write(body); } return out.toByteArray(); }
    private static byte[] readAll(File file) throws Exception { try (FileInputStream input = new FileInputStream(file)) { ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] b = new byte[256 * 1024]; for (int n; (n = input.read(b)) >= 0;) out.write(b, 0, n); return out.toByteArray(); } }
    private static String sha(byte[] body) throws Exception { StringBuilder out = new StringBuilder("sha256:"); for (byte b : MessageDigest.getInstance("SHA-256").digest(body)) out.append(String.format("%02x", b)); return out.toString(); }

    static final class BuildResult {
        final byte[] body;
        final int toSeq;
        final JSONObject holds;
        BuildResult(byte[] body, int toSeq, JSONObject holds) {
            this.body = body; this.toSeq = toSeq; this.holds = holds;
        }
    }
}
