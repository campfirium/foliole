package com.foliole.android;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import androidx.test.ext.junit.runners.AndroidJUnit4;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionSyncPackTransferTest {
    private static final String EXPECTED_SOURCE_PEER_ID = "desktop-fixture";
    @Test
    public void validatesCurrentAndSupportedLegacyEnvelope() throws Exception {
        byte[] sqlite = FolioleCompanionSyncPackEnvelopeTestSupport.sqliteBytes();
        JSONObject manifest = FolioleCompanionSyncPackEnvelopeTestSupport.manifest(sqlite);

        FolioleCompanionSyncPackEnvelopeValidator.PreparedEnvelope prepared = validate(manifest, sqlite);

        assertArrayEquals(sqlite, prepared.databaseBytes);
        assertTrue(prepared.rowCounts.containsKey("nodes"));
    }

    @Test
    public void rejectsWrongTargetAndUnsupportedVersions() throws Exception {
        byte[] sqlite = FolioleCompanionSyncPackEnvelopeTestSupport.sqliteBytes();
        assertRejected("sync_pack_target_mismatch", manifest(sqlite).put("to_peer_id", "other"), sqlite);
        assertRejected("sync_pack_source_mismatch", manifest(sqlite).put("from_device_id", "other"), sqlite);
        assertRejected("unsupported_sync_pack_format", manifest(sqlite).put("format", "other"), sqlite);
        assertRejected("unsupported_sync_pack_format_version", manifest(sqlite).put("format_version", 2), sqlite);
        assertRejected("unsupported_sync_pack_schema_version", manifest(sqlite).put("schema_version", 45), sqlite);
        assertRejected("unsupported_sync_pack_schema_version", manifest(sqlite).put("schema_version", 54), sqlite);
    }

    @Test
    public void rejectsCompressedAndUncompressedChecksumMismatch() throws Exception {
        byte[] sqlite = FolioleCompanionSyncPackEnvelopeTestSupport.sqliteBytes();
        assertRejected(
            "invalid_sync_pack_compressed_checksum",
            manifest(sqlite).put("database_compressed_sha256", "sha256:" + "0".repeat(64)),
            sqlite
        );
        assertRejected(
            "invalid_sync_pack_uncompressed_checksum",
            manifest(sqlite).put("database_uncompressed_sha256", "sha256:" + "0".repeat(64)),
            sqlite
        );
    }

    @Test
    public void rejectsInvalidTableManifestAndStrictFieldTypes() throws Exception {
        byte[] sqlite = FolioleCompanionSyncPackEnvelopeTestSupport.sqliteBytes();
        assertRejected("invalid_sync_pack_table_manifest", manifest(sqlite).put("tables", new JSONArray()), sqlite);
        assertRejected(
            "invalid_sync_pack_table_manifest",
            manifest(sqlite).put("tables", new JSONArray()
                .put(new JSONObject().put("name", "nodes").put("row_count", 0))
                .put(new JSONObject().put("name", "nodes").put("row_count", 0))),
            sqlite
        );
        assertRejected(
            "invalid_sync_pack_manifest_field",
            manifest(sqlite).put("schema_version", "46"),
            sqlite
        );
    }

    @Test
    public void rejectsMissingOrDuplicateContainerEntries() throws Exception {
        byte[] sqlite = FolioleCompanionSyncPackEnvelopeTestSupport.sqliteBytes();
        JSONObject manifest = manifest(sqlite);
        assertRejects("missing_sync_pack_entry", () ->
            FolioleCompanionSyncPackEnvelopeValidator.validate(
                FolioleCompanionSyncPackEnvelopeTestSupport.packWithoutDatabase(manifest),
                FolioleCompanionSyncPackEnvelopeTestSupport.contract(),
                "android-fixture",
                EXPECTED_SOURCE_PEER_ID
            ));
        assertRejects("duplicate_sync_pack_entry", () ->
            FolioleCompanionSyncPackEnvelopeValidator.validate(
                FolioleCompanionSyncPackEnvelopeTestSupport.packWithDuplicateManifest(manifest, sqlite),
                FolioleCompanionSyncPackEnvelopeTestSupport.contract(),
                "android-fixture",
                EXPECTED_SOURCE_PEER_ID
            ));
    }

    @Test
    public void rejectsNonSqliteBytesAfterBothChecksumsPass() throws Exception {
        byte[] invalid = "not sqlite".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        assertRejected("invalid_sync_pack_sqlite_header", manifest(invalid), invalid);
    }

    private static JSONObject manifest(byte[] sqlite) throws Exception {
        return FolioleCompanionSyncPackEnvelopeTestSupport.manifest(sqlite);
    }

    private static FolioleCompanionSyncPackEnvelopeValidator.PreparedEnvelope validate(
        JSONObject manifest,
        byte[] sqlite
    ) throws Exception {
        return FolioleCompanionSyncPackEnvelopeValidator.validate(
            FolioleCompanionSyncPackEnvelopeTestSupport.pack(manifest, sqlite),
            FolioleCompanionSyncPackEnvelopeTestSupport.contract(),
            "android-fixture",
            EXPECTED_SOURCE_PEER_ID
        );
    }

    private static void assertRejected(String code, JSONObject manifest, byte[] sqlite) throws Exception {
        assertRejects(code, () -> validate(manifest, sqlite));
    }

    private static void assertRejects(String code, CheckedAction action) throws Exception {
        try {
            action.run();
            fail("Expected rejection: " + code);
        } catch (IllegalArgumentException exception) {
            assertTrue(exception.getMessage(), exception.getMessage().contains(code));
        }
    }

    private interface CheckedAction {
        void run() throws Exception;
    }
}
