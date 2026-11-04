package com.foliole.android;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public class FolioleFolderSyncPathsTest {
    private static final String HASH = "a".repeat(64);

    @Test public void acceptsOnlyManagedRelativeFiles() {
        assertArrayEquals(new String[] { "folder-sync", "objects", HASH + ".pb" },
            FolioleFolderSyncPaths.parts("folder-sync/objects/" + HASH + ".pb"));
        assertArrayEquals(new String[] { "attachments", HASH + ".pdf" },
            FolioleFolderSyncPaths.parts("attachments/" + HASH + ".pdf"));
        assertArrayEquals(new String[] { "folder-sync", "checkpoint-1.json" },
            FolioleFolderSyncPaths.parts("folder-sync/checkpoint-1.json"));
        assertTrue(FolioleFolderSyncPaths.partial("attachments/partial-" + HASH));
        assertFalse(FolioleFolderSyncPaths.partial("attachments/" + HASH + ".pdf"));
    }

    @Test public void rejectsTraversalAbsoluteUrisAndUnmanagedFiles() {
        String[] invalid = { "../library.db", "/attachments/" + HASH + ".pdf", "content://provider/tree/x",
            "folder-sync/../library.db", "folder-sync/checkpoint-2.json", "attachments/" + HASH + ".exe",
            "folder-sync/objects/other.pb", "folder-sync//checkpoint-0.json", "personal.txt" };
        for (String key : invalid) {
            try { FolioleFolderSyncPaths.parts(key); throw new AssertionError("Accepted " + key); }
            catch (IllegalArgumentException expected) { /* Rejected before touching the provider. */ }
        }
    }
}
