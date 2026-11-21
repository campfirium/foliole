package com.foliole.android;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.function.BooleanSupplier;

/**
 * App-private staging copy of one backup. Only verified files land here: the database must
 * start with the SQLite header, an attachment must match the hash in its name, and a
 * non-empty journal means the backup was written halfway. The active library is never touched.
 */
final class FolioleBackupRestoreStaging {
    interface Progress { void copied(long bytes, int files); }

    private static final byte[] SQLITE_HEADER = "SQLite format 3\0".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    private final File database, attachments;
    private final BooleanSupplier cancelled;
    private final Progress progress;
    private final Set<String> staged = new LinkedHashSet<>();
    private boolean hasDatabase;
    private int skipped, damaged, files;
    private long bytes;

    FolioleBackupRestoreStaging(File database, File attachments, BooleanSupplier cancelled, Progress progress) {
        this.database = database; this.attachments = attachments; this.cancelled = cancelled; this.progress = progress;
    }

    void reset() throws IOException {
        for (String suffix : new String[] { "", "-journal", "-wal", "-shm" }) {
            File file = new File(database.getPath() + suffix);
            if (file.exists() && !file.delete()) throw new IOException("restore_staging_busy");
        }
        deleteTree(attachments);
        File parent = database.getParentFile();
        if ((parent != null && !parent.isDirectory() && !parent.mkdirs()) || !attachments.mkdirs()) {
            throw new IOException("restore_staging_unavailable");
        }
    }

    void database(InputStream input) throws Exception {
        if (hasDatabase) throw new IllegalStateException("restore_multiple_backups");
        byte[] header = new byte[SQLITE_HEADER.length];
        int read = 0;
        while (read < header.length) {
            int count = input.read(header, read, header.length - read);
            if (count < 0) break;
            read += count;
        }
        if (read < header.length || !Arrays.equals(header, SQLITE_HEADER)) throw new IllegalStateException("restore_not_database");
        try (FileOutputStream output = new FileOutputStream(database)) {
            output.write(header);
            copy(input, output, null);
            output.getFD().sync();
        }
        hasDatabase = true;
        counted();
    }

    /** A rollback journal or WAL left beside the copy means the backup did not finish. */
    void sidecar(InputStream input) throws Exception {
        if (input.read() != -1) throw new IllegalStateException("restore_backup_incomplete");
    }

    void attachment(String name, InputStream input) throws Exception {
        if (!FolioleCompanionCanonicalAttachmentKey.valid(name)) { skipped++; return; }
        if (staged.contains(name)) return;
        File partial = new File(attachments, name + ".partial");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileOutputStream output = new FileOutputStream(partial)) {
            copy(input, output, digest);
            output.getFD().sync();
        }
        if (!hex(digest.digest()).equals(name.substring(0, 64))) {
            if (!partial.delete()) partial.deleteOnExit();
            damaged++;
            return;
        }
        if (!partial.renameTo(new File(attachments, name))) throw new IOException("restore_staging_unavailable");
        staged.add(name);
        counted();
    }

    void finish() {
        if (!hasDatabase) throw new IllegalStateException("restore_not_backup");
    }

    Set<String> stagedKeys() { return staged; }
    int skippedFiles() { return skipped; }
    int damagedFiles() { return damaged; }

    private void copy(InputStream input, java.io.OutputStream output, MessageDigest digest) throws Exception {
        byte[] buffer = new byte[64 * 1024];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (cancelled.getAsBoolean()) throw new InterruptedException("restore_cancelled");
            output.write(buffer, 0, count);
            if (digest != null) digest.update(buffer, 0, count);
            bytes += count;
        }
    }

    private void counted() {
        files++;
        if (progress != null) progress.copied(bytes, files);
    }

    static void deleteTree(File file) throws IOException {
        if (!file.exists()) return;
        File[] children = file.isDirectory() ? file.listFiles() : null;
        if (children != null) for (File child : children) deleteTree(child);
        if (!file.delete()) throw new IOException("restore_staging_busy");
    }

    private static String hex(byte[] value) {
        StringBuilder text = new StringBuilder();
        for (byte item : value) text.append(String.format(Locale.ROOT, "%02x", item & 255));
        return text.toString();
    }
}
