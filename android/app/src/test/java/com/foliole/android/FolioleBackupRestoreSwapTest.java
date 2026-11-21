package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class FolioleBackupRestoreSwapTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private File databases, files, database, staged, stagedAttachments;

    @Before public void library() throws Exception {
        databases = new File(temporary.getRoot(), "databases");
        files = new File(temporary.getRoot(), "files");
        database = new File(databases, "foliole-companionSQLite.db");
        staged = new File(databases, "foliole-restore-stagingSQLite.db");
        stagedAttachments = new File(files, "restore-staging/attachments");
        write(database, "spare-library");
        write(new File(databases, "foliole-companionSQLite.db-wal"), "spare-wal");
        write(new File(files, "attachments/spare.png"), "spare-image");
        write(new File(files, "folder-database-backup.json"), "spare-backup-folder");
        stage("main-library", "main.png");
    }

    private void stage(String library, String image) throws Exception {
        write(staged, library);
        write(new File(stagedAttachments, image), "main-image");
    }

    private FolioleBackupRestoreSwap swap() { return new FolioleBackupRestoreSwap(database, staged, files, stagedAttachments); }

    private static void write(File file, String value) throws Exception {
        file.getParentFile().mkdirs();
        Files.write(file.toPath(), value.getBytes(StandardCharsets.UTF_8));
    }

    private static String read(File file) throws Exception { return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8); }

    private void assertSwapped() throws Exception {
        assertEquals("main-library", read(database));
        assertFalse(new File(databases, "foliole-companionSQLite.db-wal").exists());
        assertTrue(new File(files, "attachments/main.png").isFile());
        assertFalse(new File(files, "attachments/spare.png").exists());
        assertTrue(new File(files, "attachments.trash").isDirectory());
        assertFalse(new File(files, "folder-database-backup.json").exists());
        File previous = new File(files, "restore-previous");
        assertEquals("spare-library", read(new File(previous, "database/foliole-companionSQLite.db")));
        assertEquals("spare-wal", read(new File(previous, "database/foliole-companionSQLite.db-wal")));
        assertEquals("spare-image", read(new File(previous, "attachments/spare.png")));
        assertEquals("spare-backup-folder", read(new File(previous, "folder-database-backup.json")));
        assertFalse(staged.exists());
        assertFalse(new File(files, "restore-staging").exists());
        assertFalse(swap().interrupted());
    }

    @Test public void keepsTheReplacedLibraryAsThePreviousOne() throws Exception {
        swap().commit("2026-11-21T00:00:00Z");
        assertSwapped();
        assertEquals("2026-11-21T00:00:00Z", swap().previousSavedAt());
    }

    @Test public void finishesASwapInterruptedInEveryPhase() throws Exception {
        for (String phase : new String[] { "prepare", "move", "install" }) {
            library();
            FolioleBackupRestoreSwap first = swap();
            write(new File(files, "restore-commit"), phase);
            if (!phase.equals("prepare")) {
                File slot = new File(files, "restore-previous.partial/database");
                slot.mkdirs();
                write(new File(files, "restore-previous.partial/saved-at"), "then");
                assertTrue(database.renameTo(new File(slot, database.getName())));
                if (phase.equals("install")) {
                    for (String name : new String[] { "attachments", "folder-database-backup.json" }) {
                        assertTrue(new File(files, name).renameTo(new File(files, "restore-previous.partial/" + name)));
                    }
                    assertTrue(new File(databases, "foliole-companionSQLite.db-wal")
                        .renameTo(new File(slot, "foliole-companionSQLite.db-wal")));
                    assertTrue(new File(files, "restore-previous.partial").renameTo(new File(files, "restore-previous")));
                    assertTrue(staged.renameTo(database));
                }
            }
            assertTrue(first.interrupted());
            swap().commit("now");
            assertSwapped();
            deleteAll();
        }
    }

    @Test public void leavesTheLibraryAloneWhenNothingIsStaged() throws Exception {
        assertTrue(staged.delete());
        try { swap().commit("now"); fail("expected restore_nothing_staged"); }
        catch (IllegalStateException error) { assertEquals("restore_nothing_staged", error.getMessage()); }
        assertEquals("spare-library", read(database));
        assertTrue(new File(files, "attachments/spare.png").isFile());
        assertFalse(swap().interrupted());
        assertFalse(swap().hasPrevious());
    }

    @Test public void aLaterRestoreReplacesTheEarlierPreviousLibrary() throws Exception {
        swap().commit("first");
        stage("newer-main-library", "newer.png");
        swap().commit("second");
        assertEquals("newer-main-library", read(database));
        assertEquals("main-library", read(new File(files, "restore-previous/database/foliole-companionSQLite.db")));
        assertEquals("second", swap().previousSavedAt());
    }

    private void assertReverted() throws Exception {
        assertEquals("spare-library", read(database));
        assertEquals("spare-wal", read(new File(databases, "foliole-companionSQLite.db-wal")));
        assertEquals("spare-image", read(new File(files, "attachments/spare.png")));
        assertEquals("spare-backup-folder", read(new File(files, "folder-database-backup.json")));
        assertEquals("main-library", read(new File(files, "restore-previous/database/foliole-companionSQLite.db")));
        assertTrue(new File(files, "restore-previous/attachments/main.png").isFile());
        assertFalse(staged.exists());
        assertFalse(new File(files, "restore-staging").exists());
        assertFalse(swap().interrupted());
    }

    @Test public void revertingPutsThePreviousLibraryBackAndKeepsTheRestoredOne() throws Exception {
        swap().commit("restored");
        stage("unfinished-staging", "other.png");
        swap().revert("reverted");
        assertReverted();
        assertEquals("reverted", swap().previousSavedAt());
        swap().revert("again");
        assertEquals("main-library", read(database));
    }

    @Test public void finishesARevertInterruptedWhileMovingThePreviousLibraryOut() throws Exception {
        swap().commit("restored");
        write(new File(files, "restore-commit"), "revert");
        File slot = new File(files, "restore-previous/database");
        assertTrue(new File(slot, database.getName()).renameTo(staged));
        swap().commit("reverted");
        assertReverted();
    }

    @Test public void refusesToRevertWithoutAPreviousLibrary() throws Exception {
        try { swap().revert("now"); fail("expected restore_no_previous"); }
        catch (IllegalStateException error) { assertEquals("restore_no_previous", error.getMessage()); }
        assertEquals("spare-library", read(database));
        assertTrue(staged.isFile());
    }

    private void deleteAll() throws Exception {
        FolioleBackupRestoreStaging.deleteTree(databases);
        FolioleBackupRestoreStaging.deleteTree(files);
        databases.mkdirs();
        files.mkdirs();
    }
}
