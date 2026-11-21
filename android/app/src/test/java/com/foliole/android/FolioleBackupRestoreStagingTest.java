package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.Locale;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class FolioleBackupRestoreStagingTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    private static final byte[] DATABASE = "SQLite format 3\0rest-of-pages".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] IMAGE = "png-bytes".getBytes(StandardCharsets.US_ASCII);

    private FolioleBackupRestoreStaging staging() throws Exception {
        File root = temporary.getRoot();
        FolioleBackupRestoreStaging staging = new FolioleBackupRestoreStaging(new File(root, "databases/stagingSQLite.db"),
            new File(root, "restore-staging/attachments"), () -> false, null);
        staging.reset();
        return staging;
    }

    private static String key(byte[] content) throws Exception {
        StringBuilder text = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(content)) {
            text.append(String.format(Locale.ROOT, "%02x", value & 255));
        }
        return text + ".png";
    }

    @Test public void keepsOnlyAttachmentsWhoseContentMatchesTheirName() throws Exception {
        FolioleBackupRestoreStaging staging = staging();
        String good = key(IMAGE);
        staging.database(new ByteArrayInputStream(DATABASE));
        staging.attachment(good, new ByteArrayInputStream(IMAGE));
        staging.attachment(key("other".getBytes(StandardCharsets.US_ASCII)), new ByteArrayInputStream(IMAGE));
        staging.attachment("notes.txt", new ByteArrayInputStream(IMAGE));
        staging.finish();

        assertEquals(Collections.singleton(good), staging.stagedKeys());
        assertEquals(1, staging.damagedFiles());
        assertEquals(1, staging.skippedFiles());
        File attachments = new File(temporary.getRoot(), "restore-staging/attachments");
        assertEquals(1, attachments.list().length);
        assertTrue(java.util.Arrays.equals(IMAGE, Files.readAllBytes(new File(attachments, good).toPath())));
        assertTrue(java.util.Arrays.equals(DATABASE,
            Files.readAllBytes(new File(temporary.getRoot(), "databases/stagingSQLite.db").toPath())));
    }

    @Test public void rejectsFilesThatAreNotACompleteBackup() throws Exception {
        expectFailure("restore_not_database", () -> staging().database(new ByteArrayInputStream("zip".getBytes(StandardCharsets.US_ASCII))));
        expectFailure("restore_backup_incomplete", () -> staging().sidecar(new ByteArrayInputStream(new byte[] { 1 })));
        expectFailure("restore_not_backup", () -> staging().finish());
        staging().sidecar(new ByteArrayInputStream(new byte[0]));
    }

    @Test public void resetRemovesAPreviousStagingCopy() throws Exception {
        FolioleBackupRestoreStaging first = staging();
        first.database(new ByteArrayInputStream(DATABASE));
        first.attachment(key(IMAGE), new ByteArrayInputStream(IMAGE));
        staging();
        assertFalse(new File(temporary.getRoot(), "databases/stagingSQLite.db").exists());
        assertEquals(0, new File(temporary.getRoot(), "restore-staging/attachments").list().length);
    }

    @Test public void mapsBackupFilesAtTheArchiveRootOrInOneFolder() {
        FolioleBackupRestoreArchiveLayout root = new FolioleBackupRestoreArchiveLayout("Foliole.sqlite");
        assertEquals(FolioleBackupRestoreArchiveLayout.Kind.DATABASE, root.classify("Foliole.sqlite").kind);
        assertEquals("a.png", root.classify("Attachments/a.png").name);
        assertEquals(FolioleBackupRestoreArchiveLayout.Kind.IGNORED, root.classify("__MACOSX/Attachments/._a.png").kind);

        FolioleBackupRestoreArchiveLayout nested = new FolioleBackupRestoreArchiveLayout("Foliole.sqlite");
        assertEquals(FolioleBackupRestoreArchiveLayout.Kind.ATTACHMENT, nested.classify("Backup\\Attachments\\b.png").kind);
        assertEquals(FolioleBackupRestoreArchiveLayout.Kind.SIDECAR, nested.classify("Backup/Foliole.sqlite-journal").kind);
        assertEquals(FolioleBackupRestoreArchiveLayout.Kind.IGNORED, nested.classify("Backup/Attachments/.foliole-x.partial").kind);
        expectFailure("restore_multiple_backups", () -> nested.classify("Other/Foliole.sqlite"));
    }

    @Test public void rejectsEntriesThatEscapeTheStagingArea() {
        for (String name : new String[] { "../Foliole.sqlite", "/Foliole.sqlite", "Backup/../Attachments/a.png", "C:/Foliole.sqlite" }) {
            expectFailure("restore_unsafe_archive", () -> new FolioleBackupRestoreArchiveLayout("Foliole.sqlite").classify(name));
        }
    }

    private interface Action { void run() throws Exception; }

    private static void expectFailure(String message, Action action) {
        try { action.run(); fail("expected " + message); }
        catch (Exception error) { assertEquals(message, error.getMessage()); }
    }
}
