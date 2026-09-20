package com.foliole.android;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.ContextWrapper;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.nio.file.Files;
import java.security.MessageDigest;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class FolioleRemoteImageFilesTest {
    private File root;
    private Context context;
    private final byte[] bytes = Base64.decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=", Base64.DEFAULT);

    @Before public void prepareIsolatedRoot() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        root = Files.createTempDirectory(target.getCacheDir().toPath(), "s203-native-").toFile();
        context = new ContextWrapper(target) {
            @Override public File getFilesDir() { return root; }
        };
    }

    @After public void removeOwnedFixture() throws Exception {
        if (root == null) return;
        try (var entries = Files.walk(root.toPath())) {
            for (var entry : entries.sorted(java.util.Comparator.reverseOrder()).toArray(java.nio.file.Path[]::new)) {
                Files.delete(entry);
            }
        }
    }

    @Test public void restoresMissingBytesAndReusesExistingIdentity() throws Exception {
        PluginCall input = input(bytes, hash(bytes) + ".png");
        assertEquals("created", FolioleRemoteImageFiles.write(context, input).getString("storedFile"));
        File stored = new File(root, "attachments/" + hash(bytes) + ".png");
        assertArrayEquals(bytes, Files.readAllBytes(stored.toPath()));
        assertEquals("reused", FolioleRemoteImageFiles.write(context, input).getString("storedFile"));
        Files.delete(stored.toPath());
        assertEquals("created", FolioleRemoteImageFiles.write(context, input).getString("storedFile"));
        assertArrayEquals(bytes, Files.readAllBytes(stored.toPath()));
        assertEquals(1, stored.getParentFile().list().length);
    }

    @Test public void rejectsTraversalAndMismatchedContentWithoutWriting() throws Exception {
        assertThrows(IllegalArgumentException.class, () ->
            FolioleRemoteImageFiles.write(context, input(bytes, "../outside.png")));
        JSObject data = data(bytes, hash(bytes) + ".png").put("contentHash", "a".repeat(64));
        assertThrows(IllegalArgumentException.class, () -> FolioleRemoteImageFiles.write(context, call(data)));
        assertEquals(0, root.list().length);
    }

    @Test public void preservesCorruptExistingFileInsteadOfOverwriting() throws Exception {
        FolioleRemoteImageFiles.write(context, input(bytes, hash(bytes) + ".png"));
        File stored = new File(root, "attachments/" + hash(bytes) + ".png");
        byte[] existing = new byte[] {1, 2, 3};
        Files.write(stored.toPath(), existing);
        assertThrows(IllegalArgumentException.class, () ->
            FolioleRemoteImageFiles.write(context, input(bytes, hash(bytes) + ".png")));
        assertArrayEquals(existing, Files.readAllBytes(stored.toPath()));
    }

    @Test public void rejectsSymbolicLinkWithoutTouchingItsTarget() throws Exception {
        File attachments = new File(root, "attachments");
        assertTrue(attachments.mkdir());
        File other = new File(root, "untouched");
        Files.write(other.toPath(), bytes);
        Files.createSymbolicLink(new File(attachments, hash(bytes) + ".png").toPath(), other.toPath());
        assertThrows(IllegalArgumentException.class, () ->
            FolioleRemoteImageFiles.write(context, input(bytes, hash(bytes) + ".png")));
        assertArrayEquals(bytes, Files.readAllBytes(other.toPath()));
    }

    @Test public void movesRestoresAndExplicitlyEmptiesAttachmentTrash() throws Exception {
        String key = hash(bytes) + ".png";
        FolioleRemoteImageFiles.write(context, input(bytes, key));
        File active = new File(root, "attachments/" + key);
        File trash = new File(root, "attachments.trash/" + key);
        FolioleAttachmentMaintenanceFiles.move(context, key, true);
        assertFalse(active.exists());
        assertArrayEquals(bytes, Files.readAllBytes(trash.toPath()));
        JSObject resolved = FolioleCompanionAttachmentFileResolver.resolve(context, hash(bytes), "image/png", key);
        assertEquals("ready", resolved.getString("status"));
        assertArrayEquals(bytes, Files.readAllBytes(active.toPath()));
        assertFalse(trash.exists());
        FolioleAttachmentMaintenanceFiles.move(context, key, true);
        FolioleAttachmentMaintenanceFiles.execute(context, call(new JSObject()
            .put("operation", "remove-trash").put("storageKey", key)));
        assertFalse(trash.exists());
    }

    @Test public void preservesSourceWhenTrashDestinationConflicts() throws Exception {
        String key = hash(bytes) + ".png";
        FolioleRemoteImageFiles.write(context, input(bytes, key));
        File trash = new File(root, "attachments.trash");
        assertTrue(trash.mkdir());
        Files.write(new File(trash, key).toPath(), new byte[] {1, 2, 3});
        assertThrows(IllegalStateException.class, () -> FolioleAttachmentMaintenanceFiles.move(context, key, true));
        assertArrayEquals(bytes, Files.readAllBytes(new File(root, "attachments/" + key).toPath()));
    }

    private PluginCall input(byte[] value, String key) throws Exception { return call(data(value, key)); }
    private JSObject data(byte[] value, String key) throws Exception {
        return new JSObject().put("bytesBase64", Base64.encodeToString(value, Base64.NO_WRAP))
            .put("contentHash", hash(value)).put("mimeType", "image/png").put("storageKey", key);
    }
    private PluginCall call(JSObject data) { return new PluginCall(null, "FolioleCompanionSync", "s203", "writeImageAttachment", data); }
    private String hash(byte[] value) throws Exception {
        StringBuilder result = new StringBuilder();
        for (byte item : MessageDigest.getInstance("SHA-256").digest(value)) result.append(String.format("%02x", item));
        return result.toString();
    }
}
