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
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.zip.CRC32;
import java.util.zip.DeflaterOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

final class FolioleCompanionSyncPackProvider {
    private FolioleCompanionSyncPackProvider() {}

    static BuildResult build(Context context, String snapshotPath, String fromPeerId, String toPeerId, int fromSeq) throws Exception {
        return build(context, snapshotPath, fromPeerId, toPeerId, fromSeq, null, null);
    }

    static BuildResult build(Context context, String snapshotPath, String fromPeerId, String toPeerId,
                             int fromSeq, Integer requestedFrontier, String requestedEpoch) throws Exception {
        return build(context, snapshotPath, fromPeerId, toPeerId, fromSeq,
            requestedFrontier, requestedEpoch, null, null, null, null, null);
    }

    static BuildResult build(Context context, String snapshotPath, String fromPeerId, String toPeerId,
            int fromSeq, Integer requestedFrontier, String requestedEpoch, Integer requestedTo,
            String expectedIndex, String versionBits, String parentBits, String reviewBits) throws Exception {
        FolioleCompanionSyncPackProviderDefinitions definitions = FolioleCompanionSyncPackProviderDefinitions.load(context);
        String sourceEpoch = sourceEpoch(snapshotPath);
        if (requestedEpoch != null && !requestedEpoch.equals(sourceEpoch)) {
            throw new IllegalArgumentException("sync_pack_source_epoch_changed");
        }
        int frontier = sourceFrontier(snapshotPath, fromSeq, requestedFrontier);
        if (expectedIndex != null) {
            if (requestedTo == null || requestedTo < fromSeq || requestedTo > frontier) {
                throw new IllegalArgumentException("invalid_sync_pack_fact_request");
            }
            BuildResult selected = buildCandidate(context, definitions, snapshotPath, sourceEpoch,
                fromPeerId, toPeerId, fromSeq, requestedTo, frontier,
                expectedIndex, versionBits, parentBits, reviewBits);
            if (selected == null) throw new IllegalArgumentException("sync_pack_object_requires_fragments");
            return selected;
        }
        List<Integer> candidates = pageCandidates(snapshotPath, fromSeq, frontier);
        for (int index = candidates.size() - 1; index >= 0; index = index == 0 ? -1 : (index - 1) / 2) {
            BuildResult built = buildCandidate(context, definitions, snapshotPath, sourceEpoch,
                fromPeerId, toPeerId, fromSeq, candidates.get(index), frontier,
                null, null, null, null);
            if (built != null) return built;
        }
        throw new IllegalArgumentException("sync_pack_object_requires_fragments");
    }

    private static BuildResult buildCandidate(Context context, FolioleCompanionSyncPackProviderDefinitions definitions,
            String snapshotPath, String sourceEpoch, String fromPeerId, String toPeerId,
            int fromSeq, int toSeq, int frontier, String expectedIndex,
            String versionBits, String parentBits, String reviewBits) throws Exception {
        if (expectedIndex == null && FolioleCompanionSyncPackVersionBudget.exceeds(
            definitions, snapshotPath, fromSeq, toSeq)) return null;
        File packDbFile = File.createTempFile("foliole-provider-", ".db", context.getCacheDir());
        String packId = UUID.randomUUID().toString();
        SQLiteDatabase pack = SQLiteDatabase.openOrCreateDatabase(packDbFile, null);
        try {
            createPack(pack, definitions, snapshotPath, fromSeq, toSeq);
            JSONObject holds = FolioleCompanionSyncPackVersionHolds.read(pack, packId, toPeerId);
            if (expectedIndex != null) {
                JSONObject index = FolioleCompanionSyncPackFactIndex.read(pack,
                    fromSeq, toSeq, frontier, sourceEpoch);
                FolioleCompanionSyncPackFactIndex.retainMissing(pack, index,
                    expectedIndex, versionBits, parentBits, reviewBits);
            }
            if (packDbFile.length() > 4L * 1024 * 1024) return null;
            JSONObject tables = tableManifest(pack, definitions.tableNames());
            JSONObject inner = innerManifest(packId, sourceEpoch, fromSeq, toSeq, frontier, tables.getJSONArray("tables"));
            pack.execSQL("INSERT INTO pack_manifest (key, value) VALUES ('manifest_json', ?)", new Object[] { inner.toString() });
            pack.close();
            byte[] database = readAll(packDbFile);
            byte[] compressed = deflate(database);
            if (compressed.length > FolioleCompanionSyncPackFileValidator.MAX_TRANSFER_BYTES) return null;
            JSONObject manifest = outerManifest(definitions, packId, sourceEpoch, fromPeerId, toPeerId, fromSeq, toSeq, frontier,
                tableManifest(packDbFile, definitions.tableNames()).getJSONArray("tables"), database, compressed);
            byte[] archive = zip(manifest, definitions.databaseEntry(), compressed);
            return archive.length <= FolioleCompanionSyncPackFileValidator.MAX_TRANSFER_BYTES
                ? new BuildResult(archive, toSeq, holds) : null;
        } finally {
            if (pack.isOpen()) pack.close();
            if (!packDbFile.delete()) packDbFile.deleteOnExit();
        }
    }

    static void createPack(SQLiteDatabase pack, FolioleCompanionSyncPackProviderDefinitions definitions,
                                   String snapshotPath, int fromSeq, int toSeq) throws Exception {
        pack.execSQL("ATTACH DATABASE ? AS source", new Object[] { snapshotPath });
        try {
            pack.execSQL("BEGIN");
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
        } catch (Exception error) {
            if (pack.inTransaction()) pack.execSQL("ROLLBACK");
            throw error;
        } finally { pack.execSQL("DETACH DATABASE source"); }
    }

    private static int maxStateSeq(SQLiteDatabase source, String prefix) {
        try (Cursor cursor = source.rawQuery("SELECT high_water FROM " + prefix + "sync_state_sequence WHERE singleton_id = 1", null)) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }

    private static int sourceFrontier(String snapshotPath, int fromSeq, Integer requested) {
        SQLiteDatabase source = SQLiteDatabase.openDatabase(snapshotPath, null, SQLiteDatabase.OPEN_READONLY);
        try {
            int highWater = maxStateSeq(source, "");
            int frontier = requested == null ? highWater : requested;
            if (fromSeq < 0 || frontier < fromSeq || frontier > highWater) {
                throw new IllegalArgumentException("sync_pack_frontier_unavailable");
            }
            return frontier;
        } finally { source.close(); }
    }

    private static List<Integer> pageCandidates(String snapshotPath, int fromSeq, int frontier) {
        SQLiteDatabase source = SQLiteDatabase.openDatabase(snapshotPath, null, SQLiteDatabase.OPEN_READONLY);
        try {
            List<Integer> candidates = new ArrayList<>();
            try (Cursor cursor = source.rawQuery(
                "SELECT DISTINCT state_seq FROM sync_object_state WHERE state_seq > ? AND state_seq <= ? ORDER BY state_seq LIMIT 128",
                new String[] { String.valueOf(fromSeq), String.valueOf(frontier) })) {
                while (cursor.moveToNext()) candidates.add(cursor.getInt(0));
            }
            if (candidates.size() < 128 && (candidates.isEmpty() || candidates.get(candidates.size() - 1) != frontier)) {
                candidates.add(frontier);
            }
            return candidates;
        } finally { source.close(); }
    }

    private static String sourceEpoch(String snapshotPath) {
        SQLiteDatabase source = SQLiteDatabase.openDatabase(snapshotPath, null, SQLiteDatabase.OPEN_READONLY);
        try (Cursor cursor = source.rawQuery(
            "SELECT source_epoch FROM sync_state_sequence WHERE singleton_id = 1", null)) {
            if (!cursor.moveToFirst() || cursor.isNull(0)) throw new IllegalArgumentException("sync_pack_source_epoch_missing");
            return cursor.getString(0);
        } finally { source.close(); }
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

    private static JSONObject innerManifest(String id, String epoch, int from, int to, int frontier, JSONArray tables) throws Exception {
        return new JSONObject().put("pack_id", id).put("source_epoch", epoch).put("frontier_state_seq", frontier)
            .put("from_state_seq", from).put("to_state_seq", to).put("tables", tables);
    }

    private static JSONObject outerManifest(FolioleCompanionSyncPackProviderDefinitions definitions, String id, String epoch,
            String fromPeer, String toPeer, int from, int to, int frontier, JSONArray tables, byte[] database, byte[] compressed) throws Exception {
        return innerManifest(id, epoch, from, to, frontier, tables).put("format", definitions.format())
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
