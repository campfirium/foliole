package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.DeflaterOutputStream;
import java.util.zip.InflaterInputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncPackTransferValidationTest {
    private static final String EXPECTED_PEER_ID = "android-fixture";
    private static final String EXPECTED_SOURCE_PEER_ID = "authorization-desktop-fixture";
    private Context context;
    private File syncPackCache;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        syncPackCache = new File(context.getCacheDir(), "sync-packs");
        deleteRecursively(syncPackCache);
    }

    @After
    public void tearDown() {
        deleteRecursively(syncPackCache);
    }

    @Test
    public void storesContractFixtureOnlyAfterProductionDatabaseValidation() throws Exception {
        File stored = FolioleCompanionSyncPackTransfer.storeDownloadedPack(
            context,
            readContractFixture(),
            EXPECTED_PEER_ID,
            EXPECTED_SOURCE_PEER_ID
        );

        assertTrue(stored.exists());
        assertEquals(syncPackCache.getCanonicalFile(), stored.getParentFile().getCanonicalFile());
        assertTrue(FolioleCompanionSyncPackTransfer.deleteCachedPack(context, stored.getAbsolutePath()));
        assertFalse(stored.exists());
    }

    @Test
    public void rejectsMissingInnerManifestAndDeletesTemporaryDatabase() throws Exception {
        byte[] invalid = mutateDatabase(readContractFixture(), "DROP TABLE pack_manifest");

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () ->
            FolioleCompanionSyncPackTransfer.storeDownloadedPack(
                context, invalid, EXPECTED_PEER_ID, EXPECTED_SOURCE_PEER_ID)
        );

        assertTrue(error.getMessage(), error.getMessage().contains("invalid_sync_pack_table_structure:pack_manifest"));
        assertEquals(0, cachedDatabaseCount());
    }

    @Test
    public void rejectsManifestRowCountMismatchAndDeletesTemporaryDatabase() throws Exception {
        Map<String, byte[]> entries = readEntries(readContractFixture());
        JSONObject manifest = new JSONObject(new String(entries.get("manifest.json"), java.nio.charset.StandardCharsets.UTF_8));
        JSONArray tables = manifest.getJSONArray("tables");
        for (int index = 0; index < tables.length(); index += 1) {
            JSONObject table = tables.getJSONObject(index);
            if ("nodes".equals(table.getString("name"))) {
                table.put("row_count", table.getInt("row_count") + 1);
            }
        }
        byte[] invalid = zip(manifest, entries.get("incoming.db.deflate"));

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () ->
            FolioleCompanionSyncPackTransfer.storeDownloadedPack(
                context, invalid, EXPECTED_PEER_ID, EXPECTED_SOURCE_PEER_ID)
        );

        assertTrue(error.getMessage(), error.getMessage().contains("invalid_sync_pack_row_count:nodes"));
        assertEquals(0, cachedDatabaseCount());
    }

    @Test
    public void rejectsLegacyAndUnknownFormatGenerationsBeforeDatabaseWrite() throws Exception {
        for (int formatVersion : new int[] { 11, 13 }) {
            Map<String, byte[]> entries = readEntries(readContractFixture());
            JSONObject manifest = new JSONObject(new String(
                entries.get("manifest.json"), java.nio.charset.StandardCharsets.UTF_8));
            manifest.put("format_version", formatVersion);
            byte[] invalid = zip(manifest, entries.get("incoming.db.deflate"));

            IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () ->
                FolioleCompanionSyncPackTransfer.storeDownloadedPack(
                    context, invalid, EXPECTED_PEER_ID, EXPECTED_SOURCE_PEER_ID));
            assertTrue(error.getMessage(), error.getMessage().contains("unsupported_sync_pack_format_version"));
            assertEquals(0, cachedDatabaseCount());
        }
    }

    @Test
    public void storesSupportedSchema46ProjectionWithoutLegacyOptionalNodeColumns() throws Exception {
        byte[] legacy = mutateDatabase(
            readContractFixture(),
            "CREATE TABLE nodes_legacy (id TEXT PRIMARY KEY, parent_id TEXT, kind TEXT NOT NULL, " +
                "shelved_at TEXT, title TEXT NOT NULL, is_title_manual INTEGER NOT NULL DEFAULT 0, " +
                "hide_title_heading INTEGER NOT NULL DEFAULT 0, body_blob_hash TEXT, opening_text TEXT, " +
                "content TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)",
            "INSERT INTO nodes_legacy SELECT id, parent_id, kind, shelved_at, title, is_title_manual, " +
                "hide_title_heading, body_blob_hash, opening_text, content, created_at, updated_at, deleted_at FROM nodes",
            "DROP TABLE nodes",
            "ALTER TABLE nodes_legacy RENAME TO nodes"
        );
        legacy = withSchemaVersion(legacy, 46);

        File stored = FolioleCompanionSyncPackTransfer.storeDownloadedPack(
            context, legacy, EXPECTED_PEER_ID, EXPECTED_SOURCE_PEER_ID);

        assertTrue(stored.exists());
        assertTrue(FolioleCompanionSyncPackTransfer.deleteCachedPack(context, stored.getAbsolutePath()));
    }

    private byte[] mutateDatabase(byte[] pack, String... statements) throws Exception {
        Map<String, byte[]> entries = readEntries(pack);
        JSONObject manifest = new JSONObject(new String(entries.get("manifest.json"), java.nio.charset.StandardCharsets.UTF_8));
        byte[] databaseBytes = inflate(entries.get("incoming.db.deflate"));
        File databaseFile = new File(context.getCacheDir(), "mutated-sync-pack.db");
        try (FileOutputStream output = new FileOutputStream(databaseFile)) {
            output.write(databaseBytes);
        }
        SQLiteDatabase database = SQLiteDatabase.openDatabase(
            databaseFile.getAbsolutePath(),
            null,
            SQLiteDatabase.OPEN_READWRITE
        );
        for (String sql : statements) database.execSQL(sql);
        database.close();
        databaseBytes = readFile(databaseFile);
        assertTrue(databaseFile.delete());
        byte[] compressed = deflate(databaseBytes);
        manifest.put("database_compressed_sha256", sha256Uri(compressed));
        manifest.put("database_uncompressed_sha256", sha256Uri(databaseBytes));
        return zip(manifest, compressed);
    }

    private static byte[] withSchemaVersion(byte[] pack, int schemaVersion) throws Exception {
        Map<String, byte[]> entries = readEntries(pack);
        JSONObject manifest = new JSONObject(new String(entries.get("manifest.json"), java.nio.charset.StandardCharsets.UTF_8));
        manifest.put("schema_version", schemaVersion);
        return zip(manifest, entries.get("incoming.db.deflate"));
    }

    private byte[] readContractFixture() throws Exception {
        try (InputStream input = InstrumentationRegistry.getInstrumentation().getContext()
            .getAssets().open("sync-pack-contract.syncpack")) {
            return readAll(input);
        }
    }

    private static Map<String, byte[]> readEntries(byte[] pack) throws Exception {
        Map<String, byte[]> entries = new HashMap<>();
        try (ZipInputStream input = new ZipInputStream(new ByteArrayInputStream(pack))) {
            ZipEntry entry;
            while ((entry = input.getNextEntry()) != null) {
                entries.put(entry.getName(), readAll(input));
            }
        }
        return entries;
    }

    private static byte[] zip(JSONObject manifest, byte[] compressed) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.putNextEntry(new ZipEntry("manifest.json"));
            zip.write(manifest.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("incoming.db.deflate"));
            zip.write(compressed);
            zip.closeEntry();
        }
        return output.toByteArray();
    }

    private static byte[] inflate(byte[] bytes) throws Exception {
        try (InflaterInputStream input = new InflaterInputStream(new ByteArrayInputStream(bytes))) {
            return readAll(input);
        }
    }

    private static byte[] deflate(byte[] bytes) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (DeflaterOutputStream stream = new DeflaterOutputStream(output)) {
            stream.write(bytes);
        }
        return output.toByteArray();
    }

    private static String sha256Uri(byte[] bytes) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder result = new StringBuilder("sha256:");
        for (byte value : hash) result.append(String.format("%02x", value));
        return result.toString();
    }

    private static byte[] readFile(File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file)) {
            return readAll(input);
        }
    }

    private static byte[] readAll(InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
        return output.toByteArray();
    }

    private int cachedDatabaseCount() {
        File[] files = syncPackCache.listFiles((directory, name) -> name.endsWith(".db"));
        return files == null ? 0 : files.length;
    }

    private static void deleteRecursively(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteRecursively(child);
        }
        if (file.exists()) file.delete();
    }
}
