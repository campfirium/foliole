package com.foliole.android.framed;

import android.content.Context;
import android.system.Os;
import android.system.OsConstants;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.UUID;

/** Byte storage only. Transfer identities and state transitions remain in the staging contract. */
public final class FramedSyncFiles {
    private final File root;

    public FramedSyncFiles(Context context, String libraryKey) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(libraryKey.getBytes(StandardCharsets.UTF_8));
        StringBuilder id = new StringBuilder();
        for (byte value : hash) id.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        root = new File(new File(context.getNoBackupFilesDir(), "SyncTransport"), id.toString()).getCanonicalFile();
    }

    public byte[] read(String key) throws Exception {
        File file = resolve(key);
        return file.exists() ? Files.readAllBytes(file.toPath()) : null;
    }

    public void write(String key, byte[] bytes) throws Exception {
        File file = resolve(key);
        File parent = file.getParentFile();
        ensureDirectory(parent);
        File temporary = new File(parent, "." + UUID.randomUUID() + ".tmp");
        try {
            try (FileOutputStream output = new FileOutputStream(temporary)) {
                output.write(bytes);
                output.getFD().sync();
            }
            Os.rename(temporary.getPath(), file.getPath());
            syncDirectory(parent);
        } finally { Files.deleteIfExists(temporary.toPath()); }
    }

    public String[] list(String key) throws Exception {
        File directory = resolve(key);
        if (!directory.exists()) return new String[0];
        String[] names = directory.list((parent, name) -> !name.startsWith("."));
        if (names == null) throw new java.io.IOException("framed_sync_directory_unreadable");
        Arrays.sort(names);
        return names;
    }

    public void remove(String key) throws Exception {
        File file = resolve(key);
        if (!file.exists()) return;
        removeTree(file);
        syncDirectory(file.getParentFile());
    }

    private File resolve(String key) throws Exception {
        if (key == null || key.isEmpty()) throw new IllegalArgumentException("framed_sync_file_key_invalid");
        for (String part : key.split("/", -1)) {
            if (!part.matches("[a-z0-9][a-z0-9_.-]*") || part.contains("..")) {
                throw new IllegalArgumentException("framed_sync_file_key_invalid");
            }
        }
        File file = new File(root, key);
        if (!file.getCanonicalPath().equals(file.getAbsolutePath())) {
            throw new IllegalArgumentException("framed_sync_file_path_invalid");
        }
        return file;
    }

    private static void ensureDirectory(File directory) throws Exception {
        if (directory.isDirectory()) return;
        File parent = directory.getParentFile();
        if (parent == null) throw new java.io.IOException("framed_sync_directory_invalid");
        ensureDirectory(parent);
        if (!directory.mkdir() && !directory.isDirectory()) throw new java.io.IOException("framed_sync_directory_create_failed");
        syncDirectory(parent);
    }

    private static void removeTree(File file) throws Exception {
        if (!file.getCanonicalPath().equals(file.getAbsolutePath())) {
            throw new IllegalArgumentException("framed_sync_file_path_invalid");
        }
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children == null) throw new java.io.IOException("framed_sync_directory_unreadable");
            for (File child : children) removeTree(child);
        }
        Files.delete(file.toPath());
    }

    static void syncDirectory(File directory) throws Exception {
        FileDescriptor descriptor = Os.open(directory.getPath(), OsConstants.O_RDONLY, 0);
        try { Os.fsync(descriptor); } finally { Os.close(descriptor); }
    }
}
