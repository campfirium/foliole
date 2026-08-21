package com.foliole.android;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.zip.InflaterInputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

final class FolioleCompanionSyncPackEnvelopeValidator {
    private static final int COPY_BUFFER_BYTES = 256 * 1024;
    private static final byte[] SQLITE_HEADER = "SQLite format 3\0".getBytes(StandardCharsets.US_ASCII);

    private FolioleCompanionSyncPackEnvelopeValidator() {}

    static PreparedEnvelope validate(
        byte[] body,
        FolioleCompanionSyncPackContract contract,
        String expectedPeerId,
        String expectedSourcePeerId
    ) throws Exception {
        try {
            Map<String, byte[]> entries = readEntries(body, contract);
            JSONObject manifest = new JSONObject(new String(
                requireEntry(entries, "manifest.json"),
                StandardCharsets.UTF_8
            ));
            Map<String, Integer> rowCounts = validateManifest(
                manifest, contract, expectedPeerId, expectedSourcePeerId
            );
            byte[] compressed = requireEntry(entries, contract.databaseEntry());
            verifySha256(compressed, requireString(manifest, "database_compressed_sha256"), "compressed");
            byte[] database = inflate(compressed);
            verifySha256(database, requireString(manifest, "database_uncompressed_sha256"), "uncompressed");
            if (!hasSqliteHeader(database)) {
                throw invalid("invalid_sync_pack_sqlite_header");
            }
            return new PreparedEnvelope(contract, database, manifest, rowCounts);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("invalid_sync_pack_container", exception);
        }
    }

    private static Map<String, byte[]> readEntries(
        byte[] body,
        FolioleCompanionSyncPackContract contract
    ) throws Exception {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        Set<String> allowed = new java.util.LinkedHashSet<>();
        allowed.add("manifest.json");
        allowed.add(contract.databaseEntry());
        try (ZipInputStream input = new ZipInputStream(new ByteArrayInputStream(body))) {
            ZipEntry entry;
            while ((entry = input.getNextEntry()) != null) {
                String name = entry.getName();
                if (entry.isDirectory() || !allowed.contains(name)) {
                    throw invalid("invalid_sync_pack_entry");
                }
                if (entries.put(name, readAll(input)) != null) {
                    throw invalid("duplicate_sync_pack_entry");
                }
                input.closeEntry();
            }
        }
        if (!entries.keySet().equals(allowed)) {
            throw invalid("missing_sync_pack_entry");
        }
        return entries;
    }

    private static Map<String, Integer> validateManifest(
        JSONObject manifest,
        FolioleCompanionSyncPackContract contract,
        String expectedPeerId,
        String expectedSourcePeerId
    ) throws Exception {
        if (!contract.format().equals(requireString(manifest, "format"))) {
            throw invalid("unsupported_sync_pack_format");
        }
        if (requireInt(manifest, "format_version") != contract.formatVersion()) {
            throw invalid("unsupported_sync_pack_format_version");
        }
        if (!contract.compression().equals(requireString(manifest, "compression"))) {
            throw invalid("unsupported_sync_pack_compression");
        }
        if (!contract.databaseEntry().equals(requireString(manifest, "database_file"))) {
            throw invalid("invalid_sync_pack_database_entry");
        }
        int schemaVersion = requireInt(manifest, "schema_version");
        if (schemaVersion < contract.minimumSchemaVersion() || schemaVersion > contract.maximumSchemaVersion()) {
            throw invalid("unsupported_sync_pack_schema_version");
        }
        if (!expectedPeerId.equals(requireString(manifest, "to_peer_id"))) {
            throw invalid("sync_pack_target_mismatch");
        }
        requireString(manifest, "pack_id");
        if (!expectedSourcePeerId.equals(requireString(manifest, "from_peer_id"))) {
            throw invalid("sync_pack_source_mismatch");
        }
        requireString(manifest, "created_at");
        int fromStateSeq = requireInt(manifest, "from_state_seq");
        int toStateSeq = requireInt(manifest, "to_state_seq");
        if (fromStateSeq < 0 || toStateSeq < fromStateSeq) {
            throw invalid("invalid_sync_pack_state_range");
        }
        return validateTableManifest(manifest.getJSONArray("tables"), contract.manifestTableNames());
    }

    private static Map<String, Integer> validateTableManifest(JSONArray tables, Set<String> required) throws Exception {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (int index = 0; index < tables.length(); index += 1) {
            Object item = tables.get(index);
            if (!(item instanceof JSONObject)) throw invalid("invalid_sync_pack_table_manifest");
            JSONObject table = (JSONObject) item;
            String name = requireString(table, "name");
            int count = requireInt(table, "row_count");
            if (count < 0 || !required.contains(name) || counts.put(name, count) != null) {
                throw invalid("invalid_sync_pack_table_manifest");
            }
        }
        if (!counts.keySet().equals(required)) throw invalid("invalid_sync_pack_table_manifest");
        return counts;
    }

    private static String requireString(JSONObject object, String key) throws Exception {
        Object value = object.get(key);
        if (!(value instanceof String) || ((String) value).trim().isEmpty()) {
            throw invalid("invalid_sync_pack_manifest_field");
        }
        return ((String) value).trim();
    }

    private static int requireInt(JSONObject object, String key) throws Exception {
        Object value = object.get(key);
        if (!(value instanceof Number)) throw invalid("invalid_sync_pack_manifest_field");
        double number = ((Number) value).doubleValue();
        int integer = ((Number) value).intValue();
        if (number != integer) throw invalid("invalid_sync_pack_manifest_field");
        return integer;
    }

    private static byte[] inflate(byte[] bytes) throws Exception {
        try (InflaterInputStream input = new InflaterInputStream(new ByteArrayInputStream(bytes))) {
            return readAll(input);
        } catch (Exception exception) {
            throw new IllegalArgumentException("invalid_sync_pack_compressed_database", exception);
        }
    }

    private static void verifySha256(byte[] bytes, String expected, String layer) throws Exception {
        if (!sha256Uri(bytes).equals(expected)) {
            throw invalid("invalid_sync_pack_" + layer + "_checksum");
        }
    }

    private static String sha256Uri(byte[] bytes) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder result = new StringBuilder("sha256:");
        for (byte value : hash) result.append(String.format("%02x", value));
        return result.toString();
    }

    private static byte[] requireEntry(Map<String, byte[]> entries, String name) {
        byte[] bytes = entries.get(name);
        if (bytes == null || bytes.length == 0) throw invalid("missing_sync_pack_entry");
        return bytes;
    }

    private static byte[] readAll(java.io.InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[COPY_BUFFER_BYTES];
        int read;
        while ((read = input.read(buffer)) >= 0) output.write(buffer, 0, read);
        return output.toByteArray();
    }

    private static boolean hasSqliteHeader(byte[] bytes) {
        if (bytes.length < SQLITE_HEADER.length) return false;
        for (int index = 0; index < SQLITE_HEADER.length; index += 1) {
            if (bytes[index] != SQLITE_HEADER[index]) return false;
        }
        return true;
    }

    private static IllegalArgumentException invalid(String code) {
        return new IllegalArgumentException(code);
    }

    static final class PreparedEnvelope {
        final FolioleCompanionSyncPackContract contract;
        final byte[] databaseBytes;
        final JSONObject manifest;
        final Map<String, Integer> rowCounts;

        PreparedEnvelope(
            FolioleCompanionSyncPackContract contract,
            byte[] databaseBytes,
            JSONObject manifest,
            Map<String, Integer> rowCounts
        ) {
            this.contract = contract;
            this.databaseBytes = databaseBytes;
            this.manifest = manifest;
            this.rowCounts = rowCounts;
        }
    }
}
