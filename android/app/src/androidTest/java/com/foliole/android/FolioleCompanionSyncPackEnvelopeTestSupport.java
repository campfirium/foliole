package com.foliole.android;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.zip.CRC32;
import java.util.zip.DeflaterOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

final class FolioleCompanionSyncPackEnvelopeTestSupport {
    private FolioleCompanionSyncPackEnvelopeTestSupport() {}

    static FolioleCompanionSyncPackContract contract() throws Exception {
        JSONObject definition = new JSONObject();
        definition.put("compression", "zlib");
        definition.put("databaseEntry", "incoming.db.deflate");
        definition.put("format", "foliole.sync-pack");
        definition.put("formatVersion", 1);
        definition.put("legacyOptionalNodeColumns", new JSONArray());
        definition.put("manifestTableNames", new JSONArray().put("nodes"));
        definition.put("maximumSchemaVersion", 53);
        definition.put("minimumSchemaVersion", 46);
        definition.put("sqliteTableRequirements", new JSONObject()
            .put("pack_manifest", new JSONArray().put("key").put("value"))
            .put("nodes", new JSONArray().put("id")));
        return FolioleCompanionSyncPackContract.fromDefinition(definition);
    }

    static JSONObject manifest(byte[] sqliteBytes) throws Exception {
        byte[] compressed = deflate(sqliteBytes);
        return new JSONObject()
            .put("compression", "zlib")
            .put("database_compressed_sha256", sha256Uri(compressed))
            .put("database_file", "incoming.db.deflate")
            .put("database_uncompressed_sha256", sha256Uri(sqliteBytes))
            .put("format", "foliole.sync-pack")
            .put("format_version", 1)
            .put("from_device_id", "desktop-fixture")
            .put("from_state_seq", 0)
            .put("pack_id", "pack-1")
            .put("schema_version", 46)
            .put("tables", new JSONArray().put(new JSONObject().put("name", "nodes").put("row_count", 0)))
            .put("to_peer_id", "android-fixture")
            .put("to_state_seq", 0)
            .put("created_at", "2026-07-10T00:00:00.000Z");
    }

    static byte[] pack(JSONObject manifest, byte[] sqliteBytes) throws Exception {
        return zip(
            new String[] { "manifest.json", "incoming.db.deflate" },
            new byte[][] {
                manifest.toString().getBytes(StandardCharsets.UTF_8),
                deflate(sqliteBytes)
            }
        );
    }

    static byte[] packWithoutDatabase(JSONObject manifest) throws Exception {
        return zip(
            new String[] { "manifest.json" },
            new byte[][] { manifest.toString().getBytes(StandardCharsets.UTF_8) }
        );
    }

    static byte[] packWithDuplicateManifest(JSONObject manifest, byte[] sqliteBytes) throws Exception {
        byte[] manifestBytes = manifest.toString().getBytes(StandardCharsets.UTF_8);
        return storedLocalEntries(
            new String[] { "manifest.json", "manifest.json", "incoming.db.deflate" },
            new byte[][] { manifestBytes, manifestBytes, deflate(sqliteBytes) }
        );
    }

    static byte[] sqliteBytes() {
        byte[] bytes = new byte[128];
        byte[] header = "SQLite format 3\0".getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(header, 0, bytes, 0, header.length);
        return bytes;
    }

    static byte[] deflate(byte[] bytes) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (DeflaterOutputStream deflater = new DeflaterOutputStream(output)) {
            deflater.write(bytes);
        }
        return output.toByteArray();
    }

    static String sha256Uri(byte[] bytes) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder result = new StringBuilder("sha256:");
        for (byte value : hash) result.append(String.format("%02x", value));
        return result.toString();
    }

    private static byte[] zip(String[] names, byte[][] contents) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            for (int index = 0; index < names.length; index += 1) {
                zip.putNextEntry(new ZipEntry(names[index]));
                zip.write(contents[index]);
                zip.closeEntry();
            }
        }
        return output.toByteArray();
    }

    private static byte[] storedLocalEntries(String[] names, byte[][] contents) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        for (int index = 0; index < names.length; index += 1) {
            byte[] name = names[index].getBytes(StandardCharsets.UTF_8);
            CRC32 crc = new CRC32();
            crc.update(contents[index]);
            writeInt(output, 0x04034b50);
            writeShort(output, 20);
            writeShort(output, 0);
            writeShort(output, 0);
            writeShort(output, 0);
            writeShort(output, 0);
            writeInt(output, (int) crc.getValue());
            writeInt(output, contents[index].length);
            writeInt(output, contents[index].length);
            writeShort(output, name.length);
            writeShort(output, 0);
            output.write(name);
            output.write(contents[index]);
        }
        return output.toByteArray();
    }

    private static void writeShort(ByteArrayOutputStream output, int value) {
        output.write(value & 0xff);
        output.write((value >>> 8) & 0xff);
    }

    private static void writeInt(ByteArrayOutputStream output, int value) {
        writeShort(output, value);
        writeShort(output, value >>> 16);
    }
}
