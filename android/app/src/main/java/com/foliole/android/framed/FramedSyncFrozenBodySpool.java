package com.foliole.android.framed;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.security.MessageDigest;

/** The caller owns the directory and the lifetime of completed files. */
public final class FramedSyncFrozenBodySpool {
    private static final int MAX_BYTES = 1024 * 1024;

    public interface Body {
        byte[] read() throws Exception;
    }

    private FramedSyncFrozenBodySpool() {}

    public static File write(byte[] hash, long length, File directory, Body body) throws Exception {
        if (hash == null || hash.length != 32 || length < 0 || length > MAX_BYTES || body == null) throw invalid();
        String name = hex(hash);
        File target = new File(directory, name);
        File partial = File.createTempFile(name + ".", ".partial", directory);
        boolean completed = false;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (FileOutputStream output = new FileOutputStream(partial)) {
                byte[] bytes = body.read();
                if (bytes == null || bytes.length != length) throw invalid();
                digest.update(bytes);
                output.write(bytes);
            }
            if (partial.length() != length || !MessageDigest.isEqual(hash, digest.digest())) throw invalid();
            Files.move(partial.toPath(), target.toPath());
            completed = true;
            return target;
        } finally {
            if (!completed) Files.deleteIfExists(partial.toPath());
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(64);
        for (byte item : bytes) value.append(String.format("%02x", item & 0xff));
        return value.toString();
    }

    private static FramedSyncValidationException invalid() {
        return new FramedSyncValidationException("framed_sync_blob_content_mismatch");
    }
}
