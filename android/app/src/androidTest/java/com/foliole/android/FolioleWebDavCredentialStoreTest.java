package com.foliole.android;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.ContextWrapper;

import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import java.util.UUID;

@RunWith(AndroidJUnit4.class)
public final class FolioleWebDavCredentialStoreTest {
    private static final String ROOT = "https://dav.example.test/relay/";
    private static final String PASSWORD = "fixture-only-webdav-password";
    private final Context target = ApplicationProvider.getApplicationContext();
    private final String testIdentity = target.getPackageName() + ".test." + UUID.randomUUID();
    private final File directory = new File(target.getNoBackupFilesDir(), testIdentity);
    private final Context context = new ContextWrapper(target) {
        @Override public String getPackageName() { return testIdentity; }
        @Override public File getNoBackupFilesDir() { return directory; }
    };

    @Before
    public void prepareDirectory() {
        assertTrue(directory.mkdir());
    }

    @After
    public void removeTestRecordsAndKey() throws Exception {
        deleteTestKey();
        File[] children = directory.listFiles();
        if (children != null) {
            for (File child : children) Files.delete(child.toPath());
        }
        Files.deleteIfExists(directory.toPath());
    }

    @Test
    public void readsOnlyTheSavedScopeAndKeepsTheVersionImmutable() throws Exception {
        var store = new FolioleWebDavCredentialStore(context);
        var original = scope("library-a", "epoch-a", ROOT, 1);
        var credential = new FolioleWebDavCredentialStore.Credentials("fixture-user", PASSWORD);
        store.save(original, credential);
        assertNull(testKeyStore().getKey(testAlias(), null).getEncoded());
        File record = singleRecord();
        byte[] bytes = Files.readAllBytes(record.toPath());
        String asText = new String(bytes, StandardCharsets.UTF_8);
        assertFalse(asText.contains(PASSWORD));
        assertFalse(asText.contains("fixture-user"));

        var reopened = new FolioleWebDavCredentialStore(context);
        assertEquals(PASSWORD, reopened.load(original).password);
        reopened.save(original, credential);
        assertThrows(IOException.class, () -> reopened.save(original,
            new FolioleWebDavCredentialStore.Credentials("fixture-user", "different")));
        assertArrayEquals(bytes, Files.readAllBytes(record.toPath()));
        assertNull(reopened.load(scope("library-b", "epoch-a", ROOT, 1)));
        assertNull(reopened.load(scope("library-a", "epoch-b", ROOT, 1)));
        assertNull(reopened.load(scope("library-a", "epoch-a", ROOT + "different/", 1)));
        assertNull(reopened.load(scope("library-a", "epoch-a", ROOT, 2)));
    }

    @Test
    public void rejectsTamperingAndMissingKeysWithoutReplacingTheRecord() throws Exception {
        var store = new FolioleWebDavCredentialStore(context);
        var scope = scope("library-a", "epoch-a", ROOT, 1);
        var credential = new FolioleWebDavCredentialStore.Credentials("fixture-user", PASSWORD);
        store.save(scope, credential);
        File record = singleRecord();
        byte[] bytes = Files.readAllBytes(record.toPath());
        byte[] tampered = bytes.clone();
        tampered[tampered.length - 1] ^= 1;
        Files.write(record.toPath(), tampered);
        assertThrows(IOException.class, () -> store.load(scope));
        Files.write(record.toPath(), bytes);
        deleteTestKey();
        assertThrows(IOException.class, () -> store.load(scope));
        assertThrows(IOException.class, () -> store.save(scope, credential));
        assertArrayEquals(bytes, Files.readAllBytes(record.toPath()));
    }

    private File singleRecord() {
        File[] files = directory.listFiles();
        assertNotNull(files);
        assertEquals(1, files.length);
        return files[0];
    }

    private void deleteTestKey() throws Exception {
        testKeyStore().deleteEntry(testAlias());
    }

    private String testAlias() {
        return testIdentity + ".webdav-credentials.v1";
    }

    private static KeyStore testKeyStore() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        return keyStore;
    }

    private static FolioleWebDavCredentialStore.Scope scope(String library, String epoch, String root, long version) {
        return new FolioleWebDavCredentialStore.Scope(library, epoch, "fixture-group", "fixture-mac", "fixture-phone",
            "fixture-binding", root, version);
    }
}
