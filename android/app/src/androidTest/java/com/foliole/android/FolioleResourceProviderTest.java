package com.foliole.android;

import static org.junit.Assert.*;
import static com.foliole.android.FolioleResourceProviderFixture.BLOCK_BYTES;

import android.content.Context;
import android.system.Os;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.getcapacitor.JSObject;
import java.nio.file.Files;
import java.util.Arrays;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class FolioleResourceProviderTest {
    @Test public void streamsThreeHundredMebibytesThroughCurrentBlocks() throws Exception {
        try (var source = fixture(); var receiver = fixture()) {
            int blocks = 600;
            long length = 300L * 1024 * 1024;
            String key = source.createLargeSource(blocks);
            JSObject opened = source.access("source-open", key);
            assertTrue(opened.getBool("present"));
            assertEquals(length, opened.getLong("length"));
            // source-open no longer hashes whole files; the explicit hash primitive verifies content.
            assertEquals("", opened.getString("hash"));
            assertEquals(key.substring(0, 64), source.access("hash", key).getString("hash"));
            receiver.truncate(key, 0);
            for (int index = 0; index < blocks; index++) {
                long offset = (long) index * BLOCK_BYTES;
                String encoded = source.read(key, offset, BLOCK_BYTES).getString("base64");
                receiver.appendEncoded(key, offset, encoded);
            }
            source.access("source-close", key);
            assertEquals(length, receiver.partial(key).length());
            assertFalse(receiver.published(key).exists());
            receiver.access("publish", key);
            assertFalse(receiver.partial(key).exists());
            receiver.reopen();
            JSObject stored = receiver.access("source-open", key);
            assertEquals(length, stored.getLong("length"));
            assertEquals("", stored.getString("hash"));
            assertEquals(key.substring(0, 64), receiver.access("hash", key).getString("hash"));
            assertArrayEquals(new byte[] {0, 0, 0, 0}, receiver.readBytes(key, 0, 4));
            assertArrayEquals(new byte[] {87, 2, 0, 0}, receiver.readBytes(key, 599L * BLOCK_BYTES, 4));
        }
    }

    @Test public void retainsPartialAndReleasesOwnerForTruncateAndResume() throws Exception {
        int[][] lengths = {{2 * BLOCK_BYTES + 17, BLOCK_BYTES}, {3 * BLOCK_BYTES, 2 * BLOCK_BYTES}, {BLOCK_BYTES, 0}};
        byte[] bytes = FolioleResourceProviderFixture.sample(3 * BLOCK_BYTES + 31);
        String key = FolioleResourceProviderFixture.key(bytes);
        for (int[] shape : lengths) {
            try (var files = fixture()) {
                files.appendRange(key, bytes, 0, shape[0]);
                FramedSyncPayloadBudget old = files.owner;
                files.reopen();
                assertThrows(IllegalStateException.class, () -> files.access(old, "stat", key, new JSObject()));
                JSObject partial = files.access("stat", key, new JSObject().put("partial", true));
                assertEquals(shape[0], partial.getLong("length"));
                assertArrayEquals(Arrays.copyOf(bytes, shape[0]), Files.readAllBytes(files.partial(key).toPath()));
                files.access("acquire", key);
                files.truncate(key, shape[1]);
                assertArrayEquals(Arrays.copyOf(bytes, shape[1]), Files.readAllBytes(files.partial(key).toPath()));
                assertThrows(IllegalArgumentException.class, () -> files.append(key, shape[1] + 1L, new byte[] {1}));
                assertThrows(IllegalArgumentException.class, () -> files.append(key, shape[1], new byte[BLOCK_BYTES + 1]));
                if (shape[1] > 0) {
                    assertThrows(IllegalArgumentException.class, () -> files.append(key, 0, new byte[] {2}));
                }
                assertArrayEquals(Arrays.copyOf(bytes, shape[1]), Files.readAllBytes(files.partial(key).toPath()));
                files.appendRange(key, bytes, shape[1], bytes.length);
                files.access("publish", key);
                assertArrayEquals(bytes, Files.readAllBytes(files.published(key).toPath()));
                assertFalse(files.partial(key).exists());
            }
        }
    }

    @Test public void publishesVerifiedBytesWithoutOverwritingFromCorruptSources() throws Exception {
        byte[] bytes = FolioleResourceProviderFixture.sample(71);
        String key = FolioleResourceProviderFixture.key(bytes);
        try (var files = fixture()) {
            files.replacePartial(key, bytes);
            files.reopen();
            assertArrayEquals(bytes, Files.readAllBytes(files.partial(key).toPath()));
            assertFalse(files.published(key).exists());
            files.access("publish", key);
            long original = Os.stat(files.published(key).getPath()).st_ino;
            assertFalse(files.partial(key).exists());
            assertArrayEquals(bytes, Files.readAllBytes(files.published(key).toPath()));
            files.replacePartial(key, bytes);
            files.access("publish", key);
            assertEquals(original, Os.stat(files.published(key).getPath()).st_ino);
            assertFalse(files.partial(key).exists());
            files.replacePartial(key, new byte[] {1});
            assertThrows(IllegalStateException.class, () -> files.access("publish", key));
            assertArrayEquals(bytes, Files.readAllBytes(files.published(key).toPath()));
            assertArrayEquals(new byte[] {1}, Files.readAllBytes(files.partial(key).toPath()));
            Files.write(files.published(key).toPath(), new byte[] {2});
            assertThrows(IllegalStateException.class, () -> files.access("publish", key));
            assertArrayEquals(new byte[] {2}, Files.readAllBytes(files.published(key).toPath()));
            assertArrayEquals(new byte[] {1}, Files.readAllBytes(files.partial(key).toPath()));
            assertEquals(original, Os.stat(files.published(key).getPath()).st_ino);
            files.replacePartial(key, bytes);
            long replacement = Os.stat(files.partial(key).getPath()).st_ino;
            assertArrayEquals(new byte[] {2}, Files.readAllBytes(files.published(key).toPath()));
            files.access("publish", key);
            assertEquals(replacement, Os.stat(files.published(key).getPath()).st_ino);
            assertFalse(files.partial(key).exists());
            files.reopen();
            JSObject stored = files.access("source-open", key);
            assertEquals(bytes.length, stored.getLong("length"));
            assertEquals("", stored.getString("hash"));
            assertEquals(key.substring(0, 64), files.access("hash", key).getString("hash"));
            assertArrayEquals(bytes, files.readBytes(key, 0, bytes.length));
        }
    }

    @Test public void readsCanonicalSourcesAndProtectsActiveSendLeases() throws Exception {
        byte[] bytes = FolioleResourceProviderFixture.sample(83);
        String key = FolioleResourceProviderFixture.key(bytes);
        try (var files = fixture()) {
            files.replacePartial(key, bytes);
            files.access("publish", key);
            assertEquals("", files.access("source-open", key).getString("hash"));
            assertEquals(key.substring(0, 64), files.access("hash", key).getString("hash"));
            assertArrayEquals(bytes, files.readBytes(key, 0, bytes.length));
            assertThrows(IllegalStateException.class, () -> files.access("source-open", key));
            assertInvalidReads(files, key, bytes.length);
            assertThrows(IllegalStateException.class, () -> FolioleAttachmentMaintenanceFiles.move(files.context, key, true));
            assertArrayEquals(bytes, Files.readAllBytes(files.published(key).toPath()));
            files.access("source-close", key);
            assertThrows(IllegalStateException.class, () -> files.readBytes(key, 0, 1));
            FolioleAttachmentMaintenanceFiles.move(files.context, key, true);
            assertFalse(files.published(key).exists());
            assertTrue(files.access("source-open", key).getBool("present"));
            assertArrayEquals(bytes, files.readBytes(key, 0, bytes.length));
            assertThrows(IllegalStateException.class, () -> FolioleAttachmentMaintenanceFiles.move(files.context, key, false));
            files.reopen();
            FolioleAttachmentMaintenanceFiles.move(files.context, key, false);
            assertArrayEquals(bytes, Files.readAllBytes(files.published(key).toPath()));
            assertThrows(IllegalArgumentException.class, () -> files.access("source-open", "../unsafe"));
            String linked = "a".repeat(64) + ".pdf";
            Files.createSymbolicLink(files.published(linked).toPath(), files.published(key).toPath());
            assertThrows(IllegalArgumentException.class, () -> files.access("source-open", linked));
            Files.delete(files.published(linked).toPath());
            Files.delete(files.published(key).toPath());
            assertFalse(files.access("source-stat", key).getBool("present"));
            assertFalse(files.access("source-open", key).getBool("present"));
            assertThrows(IllegalStateException.class, () -> files.readBytes(key, 0, 1));
        }
    }

    private static void assertInvalidReads(FolioleResourceProviderFixture files, String key, int length) throws Exception {
        for (double[] range : new double[][] {{-1, 1}, {0.5, 1}, {0, -1}, {0, 0.5}, {0, BLOCK_BYTES + 1}, {length, 1}}) {
            assertThrows(IllegalArgumentException.class, () -> files.read(key, range[0], range[1]));
        }
        assertEquals(length, files.access("source-stat", key).getLong("length"));
    }

    private static FolioleResourceProviderFixture fixture() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        return new FolioleResourceProviderFixture(context);
    }
}
