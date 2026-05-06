package com.foliole.android;

import android.content.Context;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.InflaterInputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

final class FolioleCompanionSyncPackTransfer {
    private static final int COPY_BUFFER_BYTES = 256 * 1024;
    private static final String DATABASE_ENTRY_NAME = "incoming.db.deflate";
    private static final byte[] SQLITE_HEADER = "SQLite format 3\0".getBytes(StandardCharsets.US_ASCII);
    private static final Pattern JSON_STRING_FIELD_PATTERN = Pattern.compile(
        "\"([A-Za-z0-9_]+)\"\\s*:\\s*\"([^\"]*)\""
    );

    private FolioleCompanionSyncPackTransfer() {}

    static File downloadToCache(Context context, String url, JSONObject headers) throws Exception {
        byte[] body = FolioleCompanionDesktopHttpClient.requestBytes(url, headers);
        return storeDownloadedPack(context.getCacheDir(), body);
    }

    static File storeDownloadedPack(File cacheRoot, byte[] body) throws Exception {
        byte[] incomingDatabase = extractIncomingDatabase(body);
        File directory = cacheDirectory(cacheRoot);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Failed to create sync pack cache.");
        }
        File file = new File(directory, UUID.randomUUID() + ".db");
        try (FileOutputStream outputStream = new FileOutputStream(file)) {
            outputStream.write(incomingDatabase);
        }
        return file;
    }

    static boolean deleteCachedPack(Context context, String packPath) throws Exception {
        File directory = cacheDirectory(context).getCanonicalFile();
        File file = new File(packPath).getCanonicalFile();
        File parent = file.getParentFile();
        if (parent == null || !parent.equals(directory) || !file.getName().endsWith(".db")) {
            throw new IllegalArgumentException("pack_path is outside the sync pack cache.");
        }
        return !file.exists() || file.delete();
    }

    private static File cacheDirectory(Context context) {
        return cacheDirectory(context.getCacheDir());
    }

    private static File cacheDirectory(File cacheRoot) {
        return new File(cacheRoot, "sync-packs");
    }

    private static byte[] extractIncomingDatabase(byte[] body) throws Exception {
        byte[] compressedDatabase = null;
        String manifest = null;
        try (ZipInputStream zipInputStream = new ZipInputStream(new ByteArrayInputStream(body))) {
            ZipEntry entry;
            while ((entry = zipInputStream.getNextEntry()) != null) {
                if ("manifest.json".equals(entry.getName())) {
                    manifest = new String(readAll(zipInputStream), StandardCharsets.UTF_8);
                } else if (DATABASE_ENTRY_NAME.equals(entry.getName())) {
                    compressedDatabase = readAll(zipInputStream);
                }
            }
        }
        if (manifest == null || !"foliole.sync-pack".equals(readJsonStringField(manifest, "format"))) {
            throw new IllegalArgumentException("Invalid sync pack container.");
        }
        if (!DATABASE_ENTRY_NAME.equals(readJsonStringField(manifest, "database_file")) || compressedDatabase == null) {
            throw new IllegalArgumentException("Invalid sync pack database entry.");
        }
        byte[] databaseBytes;
        try (InflaterInputStream inputStream = new InflaterInputStream(new ByteArrayInputStream(compressedDatabase))) {
            databaseBytes = readAll(inputStream);
        }
        if (!hasSqliteHeader(databaseBytes)) {
            throw new IllegalArgumentException("Invalid sync pack database.");
        }
        return databaseBytes;
    }

    private static String readJsonStringField(String json, String key) {
        Matcher matcher = JSON_STRING_FIELD_PATTERN.matcher(json);
        while (matcher.find()) {
            if (key.equals(matcher.group(1))) {
                return matcher.group(2);
            }
        }
        return "";
    }

    private static byte[] readAll(java.io.InputStream inputStream) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[COPY_BUFFER_BYTES];
        int read;
        while ((read = inputStream.read(buffer)) >= 0) {
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private static boolean hasSqliteHeader(byte[] bytes) {
        if (bytes.length < SQLITE_HEADER.length) {
            return false;
        }
        for (int index = 0; index < SQLITE_HEADER.length; index += 1) {
            if (bytes[index] != SQLITE_HEADER[index]) {
                return false;
            }
        }
        return true;
    }
}
