package com.foliole.android;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.InflaterInputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

final class FolioleCompanionSyncPackContainer {
    private FolioleCompanionSyncPackContainer() {}

    static PreparedPack prepare(File packFile) throws Exception {
        if (!isZipFile(packFile)) {
            return new PreparedPack(packFile, null);
        }
        Map<String, byte[]> entries = readEntries(packFile);
        JSONObject manifest = readManifest(entries);
        byte[] compressedBytes = requireEntry(entries, manifest.getString("database_file"));
        verifySha256(compressedBytes, manifest.getString("database_compressed_sha256"));
        byte[] incomingBytes = decompress(compressedBytes, manifest.getString("compression"));
        verifySha256(incomingBytes, manifest.getString("database_uncompressed_sha256"));
        File incomingFile = File.createTempFile("foliole-sync-pack-", ".db", packFile.getParentFile());
        try (FileOutputStream outputStream = new FileOutputStream(incomingFile)) {
            outputStream.write(incomingBytes);
        }
        return new PreparedPack(incomingFile, manifest);
    }

    private static boolean isZipFile(File file) throws Exception {
        try (FileInputStream inputStream = new FileInputStream(file)) {
            byte[] header = new byte[4];
            return inputStream.read(header) == 4 &&
                header[0] == 0x50 && header[1] == 0x4b && header[2] == 0x03 && header[3] == 0x04;
        }
    }

    private static Map<String, byte[]> readEntries(File packFile) throws Exception {
        Map<String, byte[]> entries = new HashMap<>();
        try (ZipInputStream inputStream = new ZipInputStream(new FileInputStream(packFile))) {
            ZipEntry entry;
            while ((entry = inputStream.getNextEntry()) != null) {
                entries.put(entry.getName(), readAll(inputStream));
                inputStream.closeEntry();
            }
        }
        return entries;
    }

    private static JSONObject readManifest(Map<String, byte[]> entries) throws Exception {
        JSONObject manifest = new JSONObject(new String(requireEntry(entries, "manifest.json"), "UTF-8"));
        if (!"foliole.sync-pack".equals(manifest.optString("format")) || manifest.optInt("format_version") != 1) {
            throw new IllegalArgumentException("Invalid sync pack manifest.");
        }
        if (!"incoming.db.deflate".equals(manifest.optString("database_file"))) {
            throw new IllegalArgumentException("Invalid sync pack database file.");
        }
        return manifest;
    }

    private static byte[] requireEntry(Map<String, byte[]> entries, String name) {
        byte[] bytes = entries.get(name);
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("Missing sync pack entry: " + name);
        }
        return bytes;
    }

    private static byte[] decompress(byte[] bytes, String compression) throws Exception {
        if ("none".equals(compression)) {
            return bytes;
        }
        if (!"zlib".equals(compression)) {
            throw new IllegalArgumentException("Unsupported sync pack compression: " + compression);
        }
        try (InflaterInputStream inputStream = new InflaterInputStream(new java.io.ByteArrayInputStream(bytes))) {
            return readAll(inputStream);
        }
    }

    private static void verifySha256(byte[] bytes, String expected) throws Exception {
        if (!sha256Uri(bytes).equals(expected)) {
            throw new IllegalArgumentException("Invalid sync pack checksum.");
        }
    }

    private static String sha256Uri(byte[] bytes) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(bytes);
        StringBuilder builder = new StringBuilder("sha256:");
        for (byte value : hash) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }

    private static byte[] readAll(java.io.InputStream inputStream) throws Exception {
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = inputStream.read(buffer)) != -1) {
            outputStream.write(buffer, 0, read);
        }
        return outputStream.toByteArray();
    }

    static final class PreparedPack implements AutoCloseable {
        final File incomingFile;
        private final JSONObject manifest;

        PreparedPack(File incomingFile, JSONObject manifest) {
            this.incomingFile = incomingFile;
            this.manifest = manifest;
        }

        @Override
        public void close() {
            if (manifest != null && incomingFile.exists() && !incomingFile.delete()) {
                incomingFile.deleteOnExit();
            }
        }
    }
}
