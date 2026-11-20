package com.foliole.android;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
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
    @FunctionalInterface
    private interface FileAction {
        void run() throws Exception;
    }

    private File root;
    private Context context;
    private final byte[] bytes = Base64.decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII=", Base64.DEFAULT);
    private final byte[] secondImage = Base64.decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMw/g8AAWgBM47YVXQAAAAASUVORK5CYII=", Base64.DEFAULT);

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
        String hash = hash(bytes);
        String key = hash + ".png";
        PluginCall input = input(bytes, key);
        assertEquals("created", FolioleRemoteImageFiles.write(context, input).getString("storedFile"));
        File stored = new File(root, "attachments/" + key);
        assertArrayEquals(bytes, Files.readAllBytes(stored.toPath()));
        assertDigestReads("Three strict opens", () -> {
            for (int open = 0; open < 3; open++) assertResolvesAndDecodes(hash, key, stored, false);
        }, 3, 3L * bytes.length);
        assertDigestReads("Three display opens", () -> {
            for (int open = 0; open < 3; open++) assertResolvesAndDecodes(hash, key, stored, true);
        }, 0, 0);
        assertMultipleImagesDoNotHash(hash, key, stored);
        assertEquals("reused", FolioleRemoteImageFiles.write(context, input).getString("storedFile"));
        Files.delete(stored.toPath());
        assertEquals("missing_file", resolveImage(hash, key, true).getString("status"));
        assertEquals("created", FolioleRemoteImageFiles.write(context, input).getString("storedFile"));
        assertArrayEquals(bytes, Files.readAllBytes(stored.toPath()));
        assertFalse(java.util.Arrays.stream(stored.getParentFile().list())
            .anyMatch(name -> name.endsWith(".part")));
    }

    private void assertMultipleImagesDoNotHash(String hash, String key, File stored) throws Exception {
        String otherHash = hash(secondImage);
        String otherKey = otherHash + ".png";
        assertEquals("created", FolioleRemoteImageFiles.write(context, input(secondImage, otherKey)).getString("storedFile"));
        File other = new File(stored.getParentFile(), otherKey);
        assertDigestReads("Two different display images", () -> {
            assertResolvesAndDecodes(hash, key, stored, true);
            assertResolvesAndDecodes(otherHash, otherKey, other, true);
        }, 0, 0);
    }

    private void assertResolvesAndDecodes(String hash, String key, File stored, boolean display) throws Exception {
        JSObject resolved = resolveImage(hash, key, display);
        assertEquals("ready", resolved.getString("status"));
        String url = resolved.getString("resource_url");
        assertEquals(Uri.fromFile(stored).toString(), url);
        Bitmap bitmap = BitmapFactory.decodeFile(Uri.parse(url).getPath());
        assertNotNull("Resolved image must decode", bitmap);
        bitmap.recycle();
    }

    private void assertDigestReads(String action, FileAction execute,
                                        long digests, long bytesRead) throws Exception {
        try (AttachmentDigestReadProbe probe = AttachmentDigestReadProbe.install()) {
            execute.run();
            String measurement = action + ": SHA-256 consumed " + probe.bytes() + " bytes across " + probe.digests() + " digests";
            Bundle evidence = new Bundle();
            evidence.putString("attachmentDigestReads", measurement);
            InstrumentationRegistry.getInstrumentation().sendStatus(0, evidence);
            assertEquals(measurement, digests, probe.digests());
            assertEquals(measurement, bytesRead, probe.bytes());
        }
    }

    private JSObject resolveImage(String hash, String key, boolean display) throws Exception {
        JSObject data = new JSObject().put("content_hash", hash).put("mime_type", "image/png").put("storage_key", key);
        if (display) data.put("image_display", true);
        PluginCall call = new PluginCall(null, "FolioleCompanionSync", "image-test", "resolveAttachmentResource", data);
        return FolioleCompanionResourcePluginActions.resolveAttachmentResource(context, call);
    }

    @Test public void rejectsTraversalAndMismatchedContentWithoutWriting() throws Exception {
        assertThrows(IllegalArgumentException.class, () ->
            FolioleRemoteImageFiles.write(context, input(bytes, "../outside.png")));
        JSObject data = data(bytes, hash(bytes) + ".png").put("contentHash", "a".repeat(64));
        assertThrows(IllegalArgumentException.class, () -> FolioleRemoteImageFiles.write(context, call(data)));
        assertEquals(0, root.list().length);
    }

    @Test public void preservesCorruptExistingFileInsteadOfOverwriting() throws Exception {
        String hash = hash(bytes);
        String key = hash + ".png";
        FolioleRemoteImageFiles.write(context, input(bytes, key));
        File stored = new File(root, "attachments/" + key);
        byte[] existing = new byte[] {1, 2, 3};
        Files.write(stored.toPath(), existing);
        assertEquals("ready", resolveImage(hash, key, true).getString("status"));
        assertNull(BitmapFactory.decodeFile(stored.getPath()));
        assertEquals("missing_file", resolveImage(hash, key, false).getString("status"));
        assertThrows(IllegalArgumentException.class, () ->
            FolioleRemoteImageFiles.write(context, input(bytes, key)));
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
        assertEquals("missing_file", resolveImage(hash(bytes), hash(bytes) + ".png", true).getString("status"));
        assertArrayEquals(bytes, Files.readAllBytes(other.toPath()));
    }

    @Test public void movesRestoresAndExplicitlyEmptiesAttachmentTrash() throws Exception {
        String contentHash = hash(bytes);
        String key = contentHash + ".png";
        FolioleRemoteImageFiles.write(context, input(bytes, key));
        File active = new File(root, "attachments/" + key);
        File trash = new File(root, "attachments.trash/" + key);
        assertDigestReads("move to trash", () -> FolioleAttachmentMaintenanceFiles.move(context, key, true), 0, 0);
        assertFalse(active.exists());
        assertArrayEquals(bytes, Files.readAllBytes(trash.toPath()));
        assertDigestReads("restore on open", () -> assertResolvesAndDecodes(contentHash, key, active, true), 0, 0);
        assertArrayEquals(bytes, Files.readAllBytes(active.toPath()));
        assertFalse(trash.exists());
        FolioleAttachmentMaintenanceFiles.move(context, key, true);
        FolioleAttachmentMaintenanceFiles.execute(context, call(new JSObject()
            .put("operation", "remove-trash").put("storageKey", key)));
        assertFalse(trash.exists());
        assertAbsentImageResolvesWhileFileLockIsHeld(contentHash, key);
        assertFalse(active.exists());
        assertFalse(trash.exists());
    }

    private void assertAbsentImageResolvesWhileFileLockIsHeld(String hash, String key) throws Exception {
        java.util.concurrent.CountDownLatch held = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
        Thread holder = new Thread(() -> {
            synchronized (FolioleAttachmentBlockFiles.class) {
                held.countDown();
                try { release.await(); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            }
        });
        holder.start();
        java.util.concurrent.ExecutorService resolver = java.util.concurrent.Executors.newSingleThreadExecutor();
        try {
            assertTrue(held.await(5, java.util.concurrent.TimeUnit.SECONDS));
            JSObject result = resolver.submit(() -> resolveImage(hash, key, true)).get(5, java.util.concurrent.TimeUnit.SECONDS);
            assertEquals("missing_file", result.getString("status"));
        } finally {
            release.countDown();
            holder.join();
            resolver.shutdownNow();
        }
    }

    @Test public void keepsAnExistingRegularDestinationWithoutReadingEitherCopy() throws Exception {
        String key = hash(bytes) + ".png";
        FolioleRemoteImageFiles.write(context, input(bytes, key));
        File active = new File(root, "attachments/" + key);
        File trash = new File(root, "attachments.trash/" + key);
        assertTrue(trash.getParentFile().mkdir());
        byte[] existingTrash = {1, 2, 3};
        Files.write(trash.toPath(), existingTrash);
        assertDigestReads("move to an existing trash key",
            () -> FolioleAttachmentMaintenanceFiles.move(context, key, true), 0, 0);
        assertFalse(active.exists());
        assertArrayEquals(existingTrash, Files.readAllBytes(trash.toPath()));

        Files.write(active.toPath(), bytes);
        assertDigestReads("restore to an existing active key",
            () -> FolioleAttachmentMaintenanceFiles.move(context, key, false), 0, 0);
        assertFalse(trash.exists());
        assertArrayEquals(bytes, Files.readAllBytes(active.toPath()));

        assertTrue(trash.mkdir());
        assertThrows(IllegalStateException.class, () -> FolioleAttachmentMaintenanceFiles.move(context, key, true));
        assertArrayEquals(bytes, Files.readAllBytes(active.toPath()));
        assertTrue(trash.isDirectory());
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
