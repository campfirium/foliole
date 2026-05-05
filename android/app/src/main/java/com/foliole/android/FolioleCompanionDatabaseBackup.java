package com.foliole.android;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.channels.FileChannel;
import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;

final class FolioleCompanionDatabaseBackup {
    private static final int MAX_PRE_SYNC_BACKUPS = 5;

    private FolioleCompanionDatabaseBackup() {}

    static File createPreSyncBackup(Context context, SQLiteDatabase database, String reason) throws IOException {
        FolioleCompanionSqliteRuntime.checkpointWal(database);
        File source = new File(database.getPath());
        if (!source.isFile()) {
            throw new IOException("Companion database file is missing.");
        }
        File backupDirectory = new File(context.getFilesDir(), "sync-pre-backups");
        if (!backupDirectory.exists() && !backupDirectory.mkdirs()) {
            throw new IOException("Failed to create companion pre-sync backup directory.");
        }
        File backupFile = new File(backupDirectory, buildBackupFileName(reason));
        copyFile(source, backupFile);
        copySidecarIfPresent(source, backupFile, "-wal");
        copySidecarIfPresent(source, backupFile, "-shm");
        pruneOldBackups(backupDirectory);
        return backupFile;
    }

    private static String buildBackupFileName(String reason) {
        String safeReason = reason == null ? "sync" : reason.replaceAll("[^A-Za-z0-9._-]+", "-");
        String timestamp = Instant.now().toString().replace(':', '-').replace('.', '-');
        return "sync-pre-" + safeReason + "-" + timestamp + ".db";
    }

    private static void copyFile(File source, File target) throws IOException {
        try (
            FileChannel sourceChannel = new FileInputStream(source).getChannel();
            FileChannel targetChannel = new FileOutputStream(target).getChannel()
        ) {
            targetChannel.transferFrom(sourceChannel, 0, sourceChannel.size());
        }
    }

    private static void copySidecarIfPresent(File source, File target, String suffix) throws IOException {
        File sidecar = new File(source.getAbsolutePath() + suffix);
        if (sidecar.isFile()) {
            copyFile(sidecar, new File(target.getAbsolutePath() + suffix));
        }
    }

    private static void deleteBackupSet(File backupFile) {
        if (backupFile.exists()) {
            backupFile.delete();
        }
        new File(backupFile.getAbsolutePath() + "-wal").delete();
        new File(backupFile.getAbsolutePath() + "-shm").delete();
    }

    private static void pruneOldBackups(File backupDirectory) {
        File[] backups = backupDirectory.listFiles((dir, name) -> name.startsWith("sync-pre-") && name.endsWith(".db"));
        if (backups == null || backups.length <= MAX_PRE_SYNC_BACKUPS) {
            return;
        }
        Arrays.sort(backups, Comparator.comparingLong(File::lastModified).reversed());
        for (int index = MAX_PRE_SYNC_BACKUPS; index < backups.length; index += 1) {
            deleteBackupSet(backups[index]);
        }
    }
}
