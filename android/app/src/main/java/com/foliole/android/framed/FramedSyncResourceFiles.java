package com.foliole.android.framed;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

final class FramedSyncResourceFiles {
    private FramedSyncResourceFiles() {}

    static File partial(File directory, byte[] transferId, byte[] attemptId, byte[] hash) {
        return new File(directory, ".framed-sync-" + hex(transferId) + "-" + hex(attemptId) +
            "-" + hex(hash) + ".partial");
    }

    static String verify(File file, byte[] expectedHash, long expectedLength, int role)
        throws Exception {
        if (!file.isFile() || file.length() != expectedLength ||
            !MessageDigest.isEqual(expectedHash, sha256(file))) return null;
        String extension = extension(file, role);
        return extension == null ? null : hex(expectedHash) + extension;
    }

    private static String extension(File file, int role) throws Exception {
        byte[] prefix = new byte[12];
        int length;
        try (InputStream input = new FileInputStream(file)) {
            length = input.read(prefix);
        }
        if (role == 2) return imageExtension(prefix, length);
        if (role == 3) return starts(prefix, length, "%PDF-".getBytes()) ? ".pdf" : null;
        if (role == 4 && isEpub(file)) return ".epub";
        return null;
    }

    private static String imageExtension(byte[] bytes, int length) {
        if (starts(bytes, length, new byte[] {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a})) {
            return ".png";
        }
        if (starts(bytes, length, new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff})) return ".jpg";
        if (starts(bytes, length, "GIF87a".getBytes()) || starts(bytes, length, "GIF89a".getBytes())) {
            return ".gif";
        }
        return length >= 12 && starts(bytes, length, "RIFF".getBytes()) &&
            Arrays.equals(Arrays.copyOfRange(bytes, 8, 12), "WEBP".getBytes()) ? ".webp" : null;
    }

    private static boolean isEpub(File file) {
        try (ZipFile zip = new ZipFile(file)) {
            ZipEntry entry = zip.getEntry("mimetype");
            if (entry == null || entry.getSize() > 64) return false;
            try (InputStream input = zip.getInputStream(entry)) {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[64];
                for (int length; (length = input.read(buffer)) >= 0;) output.write(buffer, 0, length);
                return Arrays.equals(output.toByteArray(), "application/epub+zip".getBytes());
            }
        } catch (Exception ignored) {
            return false;
        }
    }

    private static byte[] sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[64 * 1024];
        try (InputStream input = new FileInputStream(file)) {
            for (int length; (length = input.read(buffer)) >= 0;) {
                if (length > 0) digest.update(buffer, 0, length);
            }
        }
        return digest.digest();
    }

    private static boolean starts(byte[] value, int length, byte[] prefix) {
        if (length < prefix.length) return false;
        for (int index = 0; index < prefix.length; index++) {
            if (value[index] != prefix[index]) return false;
        }
        return true;
    }

    static String hex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) result.append(String.format("%02x", item & 0xff));
        return result.toString();
    }
}
