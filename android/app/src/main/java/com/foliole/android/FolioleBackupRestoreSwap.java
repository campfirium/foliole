package com.foliole.android;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * Replaces the library files with a verified staged candidate by renames only. The replaced
 * library moves into one "previous" slot so it can be put back. A marker records the phase;
 * every phase only moves what is still in its old place, so an interrupted swap is finished
 * on the next start before any database opens, instead of leaving no library behind.
 */
final class FolioleBackupRestoreSwap {
    static final String[] DATABASE_SUFFIXES = { "", "-wal", "-shm", "-journal" };
    private static final String[] LIBRARY_FILES = { "attachments", "attachments.trash",
        "folder-database-backup.json", "attachment-observations.json" };
    private final File database, stagedDatabase, files, stagedAttachments, stagingRoot, previous, partial, marker;

    FolioleBackupRestoreSwap(File database, File stagedDatabase, File files, File stagedAttachments) {
        this.database = database; this.stagedDatabase = stagedDatabase; this.files = files;
        this.stagedAttachments = stagedAttachments;
        stagingRoot = stagedAttachments.getParentFile();
        previous = new File(files, "restore-previous");
        partial = new File(files, "restore-previous.partial");
        marker = new File(files, "restore-commit");
    }

    boolean interrupted() { return marker.exists(); }
    boolean hasPrevious() { return new File(previous, "saved-at").isFile(); }
    String previousSavedAt() throws IOException {
        return hasPrevious() ? new String(Files.readAllBytes(new File(previous, "saved-at").toPath()), StandardCharsets.UTF_8) : null;
    }

    void commit(String now) throws IOException {
        if (!interrupted()) {
            if (!stagedDatabase.isFile() || !stagedAttachments.isDirectory()) throw new IllegalStateException("restore_nothing_staged");
            write(marker, "prepare");
        }
        String phase = read(marker);
        if (phase.equals("revert")) {
            File slot = new File(previous, "database");
            for (String suffix : DATABASE_SUFFIXES) move(new File(slot, database.getName() + suffix), new File(stagedDatabase.getPath() + suffix));
            if (!stagingRoot.isDirectory() && !stagingRoot.mkdirs()) throw new IOException("restore_swap_unavailable");
            for (String name : LIBRARY_FILES) move(new File(previous, name), new File(stagingRoot, name));
            if (!stagedDatabase.isFile()) throw new IllegalStateException("restore_swap_database_missing");
            write(marker, phase = "prepare");
        }
        if (phase.equals("prepare")) {
            FolioleBackupRestoreStaging.deleteTree(previous);
            if (!partial.isDirectory() && !partial.mkdirs()) throw new IOException("restore_swap_unavailable");
            write(new File(partial, "saved-at"), now);
            write(marker, phase = "move");
        }
        if (phase.equals("move")) {
            if (partial.isDirectory()) {
                File slot = new File(partial, "database");
                if (!slot.isDirectory() && !slot.mkdirs()) throw new IOException("restore_swap_unavailable");
                for (String suffix : DATABASE_SUFFIXES) move(new File(database.getPath() + suffix), new File(slot, database.getName() + suffix));
                for (String name : LIBRARY_FILES) move(new File(files, name), new File(partial, name));
                rename(partial, previous);
            }
            write(marker, phase = "install");
        }
        if (phase.equals("install")) {
            for (String suffix : DATABASE_SUFFIXES) {
                if (!suffix.isEmpty()) move(new File(stagedDatabase.getPath() + suffix), new File(database.getPath() + suffix));
            }
            move(stagedDatabase, database);
            for (String name : LIBRARY_FILES) move(new File(stagingRoot, name), new File(files, name));
            for (String name : new String[] { "attachments", "attachments.trash" }) {
                File directory = new File(files, name);
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("restore_swap_unavailable");
            }
            FolioleBackupRestoreStaging.deleteTree(stagingRoot);
            if (!database.isFile()) throw new IllegalStateException("restore_swap_database_missing");
            if (!marker.delete()) throw new IOException("restore_swap_unavailable");
            return;
        }
        throw new IllegalStateException("restore_swap_marker_invalid");
    }

    /**
     * Put the previous library back. The library it replaces takes the previous slot, so
     * reverting is itself reversible; an unfinished staged backup is discarded first.
     */
    void revert(String now) throws IOException {
        if (!interrupted()) {
            if (!hasPrevious()) throw new IllegalStateException("restore_no_previous");
            for (String suffix : DATABASE_SUFFIXES) {
                File staged = new File(stagedDatabase.getPath() + suffix);
                if (staged.exists() && !staged.delete()) throw new IOException("restore_staging_busy");
            }
            FolioleBackupRestoreStaging.deleteTree(stagingRoot);
            write(marker, "revert");
        }
        commit(now);
    }

    /** Move only what is still at its source; a destination that already exists is never overwritten. */
    private static void move(File source, File target) throws IOException {
        if (!source.exists()) return;
        if (target.exists()) throw new IllegalStateException("restore_swap_target_exists");
        rename(source, target);
    }

    private static void rename(File source, File target) throws IOException {
        if (!source.renameTo(target)) throw new IOException("restore_swap_unavailable");
    }

    private static void write(File file, String value) throws IOException {
        File temporary = new File(file.getPath() + ".tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(value.getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        }
        if (!temporary.renameTo(file)) throw new IOException("restore_swap_unavailable");
    }

    private static String read(File file) throws IOException {
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8).trim();
    }
}
