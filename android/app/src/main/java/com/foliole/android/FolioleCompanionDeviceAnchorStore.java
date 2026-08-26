package com.foliole.android;

import android.content.Context;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
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

    static String loadOrCreate(File file) throws IOException {
        if (file.exists()) return read(file);
        File parent = file.getParentFile();
        if (parent == null || (!parent.isDirectory() && !parent.mkdirs())) {
            throw new IOException("device_anchor_directory_unavailable");
        }
        String anchor = UUID.randomUUID().toString().toLowerCase();
        try {
            Files.write(file.toPath(), (anchor + "\n").getBytes(StandardCharsets.UTF_8),
                StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            return anchor;
        } catch (FileAlreadyExistsException error) {
            return read(file);
        }
    }

    static String canonicalLibraryPath(File databaseFile) throws IOException {
        if (!databaseFile.isAbsolute()) throw new IOException("library_path_not_absolute");
        return databaseFile.getCanonicalPath().replace(File.separatorChar, '/');
    }

    private static String read(File file) throws IOException {
        String value = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
        if (!value.endsWith("\n") || value.indexOf('\n') != value.length() - 1) {
            throw new IOException("device_anchor_file_invalid");
        }
        String anchor = value.substring(0, value.length() - 1);
        if (!UUID_V4.matcher(anchor).matches()) throw new IOException("device_anchor_invalid");
        return anchor;
    }
}
