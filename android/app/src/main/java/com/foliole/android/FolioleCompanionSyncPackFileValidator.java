package com.foliole.android;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.zip.InflaterInputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

final class FolioleCompanionSyncPackFileValidator {
    static final int MAX_TRANSFER_BYTES = 1024 * 1024;
    private static final int MAX_DATABASE_BYTES = 4 * 1024 * 1024;
    private static final int BUFFER_BYTES = 64 * 1024;
    private static final int MAX_MANIFEST_BYTES = 1024 * 1024;
    private static final byte[] SQLITE_HEADER = "SQLite format 3\0".getBytes(StandardCharsets.US_ASCII);

    private FolioleCompanionSyncPackFileValidator() {}

    static FolioleCompanionSyncPackEnvelopeValidator.PreparedEnvelope validate(
        File pack, File database, FolioleCompanionSyncPackContract contract,
        String expectedPeerId, String expectedSourcePeerId
    ) throws Exception {
        if (pack.length() > MAX_TRANSFER_BYTES) throw invalid("sync_pack_transfer_limit_exceeded");
        File compressed = File.createTempFile("sync-pack-compressed-", ".tmp", pack.getParentFile());
        try {
            Extracted extracted = extract(pack, compressed, contract.databaseEntry());
            JSONObject manifest = new JSONObject(new String(extracted.manifest, StandardCharsets.UTF_8));
            Map<String, Integer> counts = FolioleCompanionSyncPackEnvelopeValidator.validateManifest(
                manifest, contract, expectedPeerId, expectedSourcePeerId);
            requireHash(extracted.compressedHash,
                requireHashField(manifest, "database_compressed_sha256"), "compressed");
            String databaseHash = inflate(compressed, database);
            requireHash(databaseHash,
                requireHashField(manifest, "database_uncompressed_sha256"), "uncompressed");
            try (InputStream input = new FileInputStream(database)) {
                byte[] header = new byte[SQLITE_HEADER.length];
                if (input.read(header) != header.length || !MessageDigest.isEqual(header, SQLITE_HEADER)) {
                    throw invalid("invalid_sync_pack_sqlite_header");
                }
            }
            return new FolioleCompanionSyncPackEnvelopeValidator.PreparedEnvelope(
                contract, null, manifest, counts);
        } finally {
            if (!compressed.delete()) compressed.deleteOnExit();
        }
    }

    private static Extracted extract(File pack, File compressed, String databaseEntry) throws Exception {
        Set<String> seen = new HashSet<>();
        byte[] manifest = null;
        String compressedHash = null;
        try (ZipInputStream zip = new ZipInputStream(new FileInputStream(pack))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                if (entry.isDirectory() ||
                    !("manifest.json".equals(name) || databaseEntry.equals(name))) {
                    throw invalid("invalid_sync_pack_entry");
                }
                if (!seen.add(name)) throw invalid("duplicate_sync_pack_entry");
                if ("manifest.json".equals(name)) {
                    ByteArrayOutputStream output = new ByteArrayOutputStream();
                    copy(zip, output, null, MAX_MANIFEST_BYTES);
                    manifest = output.toByteArray();
                } else {
                    MessageDigest digest = MessageDigest.getInstance("SHA-256");
                    try (OutputStream output = new FileOutputStream(compressed)) {
                        copy(zip, output, digest, MAX_TRANSFER_BYTES);
                    }
                    compressedHash = sha256Uri(digest.digest());
                }
                zip.closeEntry();
            }
        }
        if (seen.size() != 2 || manifest == null || manifest.length == 0 ||
            compressedHash == null || compressed.length() == 0) throw invalid("missing_sync_pack_entry");
        return new Extracted(manifest, compressedHash);
    }

    private static String inflate(File compressed, File database) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new InflaterInputStream(new FileInputStream(compressed));
             OutputStream output = new FileOutputStream(database)) {
            copy(input, output, digest, MAX_DATABASE_BYTES);
        } catch (Exception error) {
            throw new IllegalArgumentException("invalid_sync_pack_compressed_database", error);
        }
        return sha256Uri(digest.digest());
    }

    private static void copy(InputStream input, OutputStream output, MessageDigest digest, long limit) throws Exception {
        byte[] buffer = new byte[BUFFER_BYTES];
        int count;
        long total = 0;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > limit) throw invalid("invalid_sync_pack_manifest_field");
            if (digest != null) digest.update(buffer, 0, count);
            output.write(buffer, 0, count);
        }
    }

    private static String requireHashField(JSONObject manifest, String key) throws Exception {
        Object value = manifest.get(key);
        if (!(value instanceof String) || ((String) value).trim().isEmpty()) {
            throw invalid("invalid_sync_pack_manifest_field");
        }
        return ((String) value).trim();
    }

    private static void requireHash(String actual, String expected, String layer) {
        if (!actual.equals(expected)) throw invalid("invalid_sync_pack_" + layer + "_checksum");
    }

    private static String sha256Uri(byte[] hash) {
        StringBuilder value = new StringBuilder("sha256:");
        for (byte item : hash) value.append(String.format("%02x", item));
        return value.toString();
    }

    private static IllegalArgumentException invalid(String code) {
        return new IllegalArgumentException(code);
    }

    private static final class Extracted {
        final byte[] manifest;
        final String compressedHash;

        Extracted(byte[] manifest, String compressedHash) {
            this.manifest = manifest;
            this.compressedHash = compressedHash;
        }
    }
}
