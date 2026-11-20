package com.foliole.android;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.ContextWrapper;
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

/** Presence-only attachment resolution answers from file metadata, while strict resolution still hashes. */
@RunWith(AndroidJUnit4.class)
public class FolioleAttachmentPresenceResolveTest {
    private final byte[] bytes = new byte[256 * 1024];
    private File root;
    private Context context;

    @Before public void prepareIsolatedRoot() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        root = Files.createTempDirectory(target.getCacheDir().toPath(), "t825-presence-").toFile();
        context = new ContextWrapper(target) {
            @Override public File getFilesDir() { return root; }
        };
        for (int index = 0; index < bytes.length; index++) bytes[index] = (byte) index;
    }

    @After public void removeOwnedFixture() throws Exception {
        try (var entries = Files.walk(root.toPath())) {
            for (var entry : entries.sorted(java.util.Comparator.reverseOrder()).toArray(java.nio.file.Path[]::new)) {
                Files.delete(entry);
            }
        }
    }

    @Test public void presenceSkipsTheDigestWhileStrictResolutionStillRejectsDamagedBytes() throws Exception {
        String hash = hash(bytes);
        String key = hash + ".pdf";
        File stored = new File(root, "attachments/" + key);
        assertTrue(stored.getParentFile().mkdirs());
        Files.write(stored.toPath(), bytes);

        try (AttachmentDigestReadProbe probe = AttachmentDigestReadProbe.install()) {
            assertEquals("ready", resolve(hash, key, true).getString("status"));
            assertEquals(0, probe.digests());
            assertEquals("ready", resolve(hash, key, false).getString("status"));
            assertEquals(1, probe.digests());
            assertEquals(bytes.length, probe.bytes());
        }

        Files.write(stored.toPath(), new byte[] {1, 2, 3});
        try (AttachmentDigestReadProbe probe = AttachmentDigestReadProbe.install()) {
            assertEquals("ready", resolve(hash, key, true).getString("status"));
            assertEquals(0, probe.digests());
            assertEquals("missing_file", resolve(hash, key, false).getString("status"));
            assertEquals(1, probe.digests());
        }
    }

    @Test public void presenceStillRejectsMissingFilesAndLinks() throws Exception {
        String hash = hash(bytes);
        String key = hash + ".pdf";
        File attachments = new File(root, "attachments");
        assertTrue(attachments.mkdirs());
        assertEquals("missing_file", resolve(hash, key, true).getString("status"));
        File other = new File(root, "elsewhere");
        Files.write(other.toPath(), bytes);
        Files.createSymbolicLink(new File(attachments, key).toPath(), other.toPath());
        assertEquals("missing_file", resolve(hash, key, true).getString("status"));
    }

    private JSObject resolve(String hash, String key, boolean presenceOnly) throws Exception {
        JSObject data = new JSObject().put("content_hash", hash).put("mime_type", "application/pdf").put("storage_key", key);
        if (presenceOnly) data.put("presence_only", true);
        PluginCall call = new PluginCall(null, "FolioleCompanionSync", "t825", "resolveAttachmentResource", data);
        return FolioleCompanionResourcePluginActions.resolveAttachmentResource(context, call);
    }

    private String hash(byte[] value) throws Exception {
        StringBuilder result = new StringBuilder();
        for (byte item : MessageDigest.getInstance("SHA-256").digest(value)) result.append(String.format("%02x", item));
        return result.toString();
    }
}
