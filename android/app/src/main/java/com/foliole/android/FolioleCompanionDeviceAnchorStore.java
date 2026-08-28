package com.foliole.android;

import android.content.Context;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.channels.FileLock;
import java.util.UUID;
import java.util.regex.Pattern;

final class FolioleCompanionDeviceAnchorStore {
    private static final String ANCHOR_FILE = "foliole-device-anchor-v1";
    private static final Pattern UUID_V4 = Pattern.compile(
        "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    );

    private FolioleCompanionDeviceAnchorStore() {}

    static String loadOrCreate(Context context) throws IOException {
        return loadOrCreate(anchorFile(context));
    }

    static File anchorFile(Context context) {
        return new File(context.getNoBackupFilesDir(), ANCHOR_FILE);
    }

    static synchronized String loadOrCreate(File file) throws IOException {
        File parent = file.getParentFile();
        if (parent == null || (!parent.isDirectory() && !parent.mkdirs())) {
            throw new IOException("device_anchor_directory_unavailable");
        }
        File lockFile = new File(file.getPath() + ".lock");
        try (RandomAccessFile lockOwner = new RandomAccessFile(lockFile, "rw");
             FileLock ignored = lockOwner.getChannel().lock()) {
            if (file.exists()) return read(file);
            String anchor = UUID.randomUUID().toString().toLowerCase();
            if (!file.createNewFile()) return read(file);
            try (FileOutputStream output = new FileOutputStream(file, false)) {
                output.write((anchor + "\n").getBytes(StandardCharsets.UTF_8));
                output.getFD().sync();
            }
            return anchor;
        }
    }

    static String canonicalLibraryPath(File databaseFile) throws IOException {
        if (!databaseFile.isAbsolute()) throw new IOException("library_path_not_absolute");
        return databaseFile.getCanonicalPath().replace(File.separatorChar, '/');
    }

    private static String read(File file) throws IOException {
        byte[] bytes = new byte[(int) file.length()];
        try (FileInputStream input = new FileInputStream(file)) {
            int offset = 0;
            while (offset < bytes.length) {
                int count = input.read(bytes, offset, bytes.length - offset);
                if (count < 0) throw new IOException("device_anchor_file_truncated");
                offset += count;
            }
            if (input.read() != -1) throw new IOException("device_anchor_file_changed");
        }
        String value = new String(bytes, StandardCharsets.UTF_8);
        if (!value.endsWith("\n") || value.indexOf('\n') != value.length() - 1) {
            throw new IOException("device_anchor_file_invalid");
        }
        String anchor = value.substring(0, value.length() - 1);
        if (!UUID_V4.matcher(anchor).matches()) throw new IOException("device_anchor_invalid");
        return anchor;
    }
}
