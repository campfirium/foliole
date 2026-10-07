package com.foliole.android;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Owns the raw HTTP body until verified frames have been copied to durable staging. */
final class FolioleCompanionFramedHttpBody implements AutoCloseable {
    final File file;
    final long byteLength;
    final String sha256;

    private FolioleCompanionFramedHttpBody(File file, long byteLength, String sha256) {
        this.file = file; this.byteLength = byteLength; this.sha256 = sha256;
    }

    static FolioleCompanionFramedHttpBody spool(InputStream input, File directory, String expected) throws Exception {
        if (expected == null || !expected.matches("^[0-9a-f]{64}$")) throw new SecurityException("invalid_signature");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("http_body_directory_unavailable");
        File file = File.createTempFile("foliole-framed-http-", ".body", directory);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long size = copy(input, file, digest);
            String actual = hex(digest.digest());
            if (!MessageDigest.isEqual(actual.getBytes(StandardCharsets.US_ASCII), expected.getBytes(StandardCharsets.US_ASCII))) {
                throw new SecurityException("invalid_signature");
            }
            return new FolioleCompanionFramedHttpBody(file, size, actual);
        } catch (Exception error) {
            if (!file.delete()) error.addSuppressed(new IOException("http_body_cleanup_failed"));
            throw error;
        }
    }

    private static long copy(InputStream input, File file, MessageDigest digest) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long size = 0;
        try (FileOutputStream output = new FileOutputStream(file)) {
            for (int count; (count = input.read(buffer)) >= 0;) {
                if (count == 0) throw new IOException("http_body_read_failed");
                output.write(buffer, 0, count);
                digest.update(buffer, 0, count);
                size += count;
            }
        }
        return size;
    }

    InputStream open() throws IOException { return new FileInputStream(file); }

    @Override public void close() throws IOException {
        if (file.exists() && !file.delete()) throw new IOException("http_body_cleanup_failed");
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02x", Byte.toUnsignedInt(value)));
        return result.toString();
    }
}
