package com.foliole.android.framed;

import static org.junit.Assert.*;
import java.io.File;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public final class AttachmentFilePipelineTest {
    @Rule public final TemporaryFolder temporary = new TemporaryFolder();
    private static String key(byte[] bytes) throws Exception {
        var result = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) result.append(String.format("%02x", value));
        return result + ".png";
    }
    private static void await(CountDownLatch latch) {
        try { if (!latch.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("test_gate_timeout"); }
        catch (InterruptedException error) { throw new IllegalStateException(error); }
    }
    @Test public void blockedHashDoesNotPreventAnotherFileFromWritingAndPublishing() throws Exception {
        try (var store = new AttachmentFileStore(temporary.newFolder())) {
            byte[] a = new byte[131072], b = new byte[131072]; b[0] = 1;
            String keyA = key(a), keyB = key(b);
            Files.write(store.resolve(keyA, true).toPath(), a);
            CountDownLatch hashing = new CountDownLatch(1), release = new CountDownLatch(1);
            var worker = Executors.newSingleThreadExecutor();
            try (AutoCloseable lease = store.lease(keyA)) {
                var hash = worker.submit(() -> AttachmentFileStore.digest(store.resolve(keyA, true), "SHA-256", () -> {}, () -> {
                    hashing.countDown(); await(release);
                }));
                try {
                    await(hashing);
                    try (var receive = store.receive(keyB, 0, 0, () -> {})) { receive.append(0, ByteBuffer.wrap(b)); }
                    try (AutoCloseable second = store.lease(keyB)) {
                        AttachmentFileStore.publish(store.resolve(keyB, true), store.resolve(keyB, false), keyB.substring(0, 64), "SHA-256", () -> {}, () -> {});
                    }
                    assertArrayEquals(b, Files.readAllBytes(store.resolve(keyB, false).toPath()));
                    assertFalse(hash.isDone());
                } finally { release.countDown(); }
                assertEquals(keyA.substring(0, 64), hash.get(5, TimeUnit.SECONDS));
            } finally { release.countDown(); worker.shutdownNow(); }
        }
    }
    @Test public void sealingClosesTheFileButKeepsCanonicalOwnershipUntilSettlement() throws Exception {
        try (var store = new AttachmentFileStore(temporary.newFolder())) {
            byte[] bytes = new byte[128]; String key = key(bytes);
            var receive = store.receive(key, 0, 0, () -> {});
            receive.append(0, ByteBuffer.wrap(bytes)); receive.seal();
            assertThrows(IllegalStateException.class, () -> store.lease(key.replace(".png", ".jpg")));
            assertThrows(IllegalArgumentException.class, () -> receive.append(bytes.length, ByteBuffer.allocate(0)));
            receive.close();
            try (AutoCloseable next = store.lease(key)) { assertArrayEquals(bytes, Files.readAllBytes(store.resolve(key, true).toPath())); }
        }
    }
    @Test public void descriptionCanNarrowAnUnknownPartialOnlyAfterItsObservedLengthIsChecked() throws Exception {
        try (var store = new AttachmentFileStore(temporary.newFolder())) {
            String key = key(new byte[10]);
            Files.write(store.resolve(key, true).toPath(), new byte[100]);
            assertThrows(IllegalArgumentException.class, () -> store.receive(key, 0, 99, () -> {}));
            assertEquals(100, store.resolve(key, true).length());
            try (var receive = store.receive(key, 0, 100, () -> {})) { assertEquals(0, store.resolve(key, true).length()); }
        }
    }
    @Test public void cancellationStopsHashBeforePublishAndPreservesTheFormalFile() throws Exception {
        try (var store = new AttachmentFileStore(temporary.newFolder())) {
            byte[] bytes = new byte[131072]; String key = key(bytes);
            File partial = store.resolve(key, true), formal = store.resolve(key, false);
            Files.write(partial.toPath(), bytes); Files.write(formal.toPath(), new byte[] {9});
            AtomicBoolean cancelled = new AtomicBoolean();
            assertThrows(IllegalStateException.class, () -> AttachmentFileStore.publish(partial, formal, key.substring(0, 64), "SHA-256",
                () -> { if (cancelled.get()) throw new IllegalStateException("cancelled"); }, () -> cancelled.set(true)));
            assertArrayEquals(new byte[] {9}, Files.readAllBytes(formal.toPath()));
            assertEquals(bytes.length, partial.length());
        }
    }
    @Test public void librariesWithTheSameHashHaveIndependentOwnership() throws Exception {
        try (var a = new AttachmentFileStore(temporary.newFolder()); var b = new AttachmentFileStore(temporary.newFolder())) {
            String key = key(new byte[1]);
            try (AutoCloseable first = a.lease(key); AutoCloseable second = b.lease(key)) { assertNotEquals(a.root(), b.root()); }
        }
    }
}
