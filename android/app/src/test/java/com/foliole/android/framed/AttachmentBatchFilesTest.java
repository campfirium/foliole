package com.foliole.android.framed;

import static org.junit.Assert.*;
import java.nio.file.Files;
import java.util.List;
import java.util.Set;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public final class AttachmentBatchFilesTest {
    @Rule public final TemporaryFolder temporary = new TemporaryFolder();
    @Test public void authenticatesAndPublishes128SmallFilesWithoutPaddingInOneResponse() throws Exception {
        try (var fixture = new AttachmentBatchFileFixture(temporary.newFolder(), 128, () -> {}, () -> {})) {
            fixture.read(fixture.wire(), (event, value) -> {
                fixture.receiver.accept(event, value);
                if (event == AttachmentBatchAuthorization.Event.FILE_END) fixture.finish(fixture.queue.read().get(0));
            });
            assertEquals(16 * 1024 * 1024, fixture.receiver.bytes()); assertEquals(128, fixture.receiver.blocks());
            assertEquals(128, fixture.receiver.result().size()); assertEquals(0, fixture.capacity.used());
            for (int i = 0; i < 128; i++) {
                assertArrayEquals(fixture.contents.get(i), Files.readAllBytes(fixture.store.resolve(fixture.entries.get(i).key, false).toPath()));
            }
        }
    }
    @Test public void hashCanBlockWhileLaterFilesWriteButOnlyFourOwnCompletionSlots() throws Exception {
        CountDownLatch hashEntered = new CountDownLatch(1), releaseHash = new CountDownLatch(1), fourSealed = new CountDownLatch(1);
        var hashWorker = Executors.newSingleThreadExecutor(); var dataWorker = Executors.newSingleThreadExecutor();
        AtomicReference<AttachmentBatchFileFixture> current = new AtomicReference<>();
        Set<Integer> handled = ConcurrentHashMap.newKeySet();
        Runnable wake = () -> hashWorker.execute(() -> {
            var fixture = current.get();
            try { for (var fact : fixture.queue.read()) if (handled.add(fact.sequence)) fixture.finish(fact); }
            catch (Exception error) { throw new CompletionException(error); }
        });
        try (var fixture = new AttachmentBatchFileFixture(temporary.newFolder(), 6, wake, () -> {
            hashEntered.countDown();
            try { if (!releaseHash.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("test_hash_gate"); }
            catch (InterruptedException error) { throw new IllegalStateException(error); }
        })) {
            current.set(fixture); byte[] wire = fixture.wire();
            Future<?> transfer = dataWorker.submit(() -> {
                fixture.read(wire, (event, value) -> {
                    fixture.receiver.accept(event, value);
                    if (event == AttachmentBatchAuthorization.Event.FILE_END && value.getStorageKey().equals(fixture.entries.get(3).key)) fourSealed.countDown();
                }); return null;
            });
            try {
                assertTrue(hashEntered.await(5, TimeUnit.SECONDS)); assertTrue(fourSealed.await(5, TimeUnit.SECONDS));
                assertEquals(4, fixture.capacity.used());
                assertEquals(131072, fixture.store.resolve(fixture.entries.get(3).key, true).length());
                assertFalse(fixture.store.resolve(fixture.entries.get(4).key, true).exists()); assertFalse(transfer.isDone());
            } finally { releaseHash.countDown(); }
            transfer.get(5, TimeUnit.SECONDS);
            hashWorker.submit(() -> {}).get(5, TimeUnit.SECONDS);
            assertEquals(0, fixture.capacity.used()); assertEquals(6, fixture.receiver.result().size());
        } finally { releaseHash.countDown(); hashWorker.shutdownNow(); dataWorker.shutdownNow(); }
    }
    @Test public void missingBatchEndDoesNotUndoAnIndependentlyVerifiedPublishedFile() throws Exception {
        try (var fixture = new AttachmentBatchFileFixture(temporary.newFolder(), 2, () -> {}, () -> {})) {
            fixture.messages.remove(fixture.messages.size() - 1);
            assertThrows(IllegalArgumentException.class, () -> fixture.read(fixture.wire(), (event, value) -> {
                fixture.receiver.accept(event, value);
                if (event == AttachmentBatchAuthorization.Event.FILE_END) fixture.finish(fixture.queue.read().get(0));
            }));
            assertThrows(IllegalStateException.class, fixture.receiver::result);
            for (int i = 0; i < 2; i++) assertArrayEquals(fixture.contents.get(i),
                Files.readAllBytes(fixture.store.resolve(fixture.entries.get(i).key, false).toPath()));
            assertEquals(0, fixture.capacity.used());
        }
    }
    @Test public void settlementCannotReleaseCanonicalOwnershipWhileTheRealHashIsStillRunning() throws Exception {
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        var worker = Executors.newSingleThreadExecutor();
        try (var fixture = new AttachmentBatchFileFixture(temporary.newFolder(), 1, () -> {}, () -> {
            entered.countDown();
            try { if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("test_hash_gate"); }
            catch (InterruptedException error) { throw new IllegalStateException(error); }
        })) {
            fixture.read(fixture.wire(), fixture.receiver::accept);
            int sequence = fixture.queue.read().get(0).sequence; fixture.queue.claim(List.of(sequence));
            var hash = worker.submit(() -> fixture.finalizer.verify(sequence));
            try {
                assertTrue(entered.await(5, TimeUnit.SECONDS));
                assertThrows(IllegalStateException.class, () -> fixture.receiver.settle(sequence, false));
                assertThrows(IllegalStateException.class, () -> fixture.store.lease(fixture.entries.get(0).key));
            } finally { release.countDown(); }
            assertTrue(hash.get(5, TimeUnit.SECONDS)); fixture.receiver.settle(sequence, false);
            try (AutoCloseable ownership = fixture.store.lease(fixture.entries.get(0).key)) { assertEquals(0, fixture.capacity.used()); }
        } finally { release.countDown(); worker.shutdownNow(); }
    }
}
