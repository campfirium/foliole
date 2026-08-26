package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

@RunWith(AndroidJUnit4.class)
public class FolioleCompanionDeviceAnchorStoreTest {
    private final Context context = ApplicationProvider.getApplicationContext();
    private final File root = new File(context.getCacheDir(), "device-anchor-test-" + System.nanoTime());

    @After
    public void cleanup() {
        deleteRecursively(root);
    }

    @Test
    public void defaultStoreUsesPrivateNoBackupDeviceState() {
        assertEquals(context.getNoBackupFilesDir(),
            FolioleCompanionDeviceAnchorStore.anchorFile(context).getParentFile());
    }

    @Test
    public void restartUpgradeAndDatabaseSwitchKeepOneAnchor() throws Exception {
        File anchorFile = new File(root, "anchor-v1");
        String first = FolioleCompanionDeviceAnchorStore.loadOrCreate(anchorFile);
        String restarted = FolioleCompanionDeviceAnchorStore.loadOrCreate(anchorFile);
        File databaseA = new File(root, "library-a/Data/foliole.db").getAbsoluteFile();
        File databaseB = new File(root, "library-b/Data/foliole.db").getAbsoluteFile();

        assertEquals(first, restarted);
        assertTrue(first.matches("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"));
        assertNotEquals(
            FolioleCompanionDeviceAnchorStore.canonicalLibraryPath(databaseA),
            FolioleCompanionDeviceAnchorStore.canonicalLibraryPath(databaseB)
        );
    }

    @Test
    public void corruptAnchorFailsClosed() throws Exception {
        File anchorFile = new File(root, "anchor-v1");
        assertTrue(root.mkdirs());
        try (FileOutputStream output = new FileOutputStream(anchorFile)) {
            output.write("not-a-device-anchor\n".getBytes(StandardCharsets.UTF_8));
        }

        assertThrows(Exception.class, () -> FolioleCompanionDeviceAnchorStore.loadOrCreate(anchorFile));
    }

    private static void deleteRecursively(File value) {
        File[] children = value.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        value.delete();
    }
}
