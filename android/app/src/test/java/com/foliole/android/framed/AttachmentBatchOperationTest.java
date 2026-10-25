package com.foliole.android.framed;

import static org.junit.Assert.*;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public final class AttachmentBatchOperationTest {
    @Rule public final TemporaryFolder temporary = new TemporaryFolder();
    private static AttachmentBatchOperation operation(AttachmentBatchFileFixture fixture, FramedSyncPayloadBudget owner,
        AttachmentCompletionCapacity capacity, Runnable closed, Runnable progress) throws Exception {
        return new AttachmentBatchOperation("operation", owner, fixture.store, () -> () -> closed.run(), capacity, new byte[16],
            fixture.entries, AttachmentBatchFileFixture.CONTEXT, "a-epoch", "SHA-256", () -> {}, () -> {}, progress);
    }
    private static void data(AttachmentBatchFileFixture fixture, AttachmentBatchOperation operation) throws Exception {
        operation.start();
        for (var value : fixture.messages) {
            var event = operation.permission.accept(value, value.getSerializedSize());
            operation.receiver.accept(event, value);
        }
        operation.permission.finish();
    }
    @Test public void lostHttpResultIsReadableAfterDataExitAndClaimAckLossDoesNotReleaseCapacity() throws Exception {
        try (var fixture = new AttachmentBatchFileFixture(temporary.newFolder(), 1, () -> {}, () -> {})) {
            var owner = new FramedSyncPayloadBudget("library", "generation"); var capacity = new AttachmentCompletionCapacity();
            var operation = operation(fixture, owner, capacity, () -> {}, () -> {});
            data(fixture, operation); operation.dataExited(null);
            assertEquals("data_complete", operation.snapshot().state); assertFalse(operation.exit().isDone());
            int sequence = operation.snapshot().files.get(0).sequence;
            operation.queue.claim(List.of(sequence)); operation.queue.claim(List.of(sequence));
            assertEquals(1, capacity.used()); assertTrue(operation.verify(sequence));
            operation.finalizeFile("publish", sequence); operation.finalizeFile("publish", sequence);
            assertFalse(operation.exit().isDone());
            operation.receiver.settle(sequence, true); operation.changed();
            operation.receiver.settle(sequence, true); operation.changed();
            assertEquals("closed", operation.snapshot().state); assertEquals("complete", operation.snapshot().outcome);
            assertEquals(0, capacity.used()); operation.exit().get(5, TimeUnit.SECONDS);
        }
    }
    @Test public void ownerRetirementWaitsForActualHttpExitEvenWhenCancellationHasBeenSent() throws Exception {
        try (var fixture = new AttachmentBatchFileFixture(temporary.newFolder(), 1, () -> {}, () -> {})) {
            var owner = new FramedSyncPayloadBudget("library", "generation"); AtomicBoolean closed = new AtomicBoolean();
            var operation = operation(fixture, owner, new AttachmentCompletionCapacity(), () -> closed.set(true), () -> {});
            operation.start(); owner.cancel();
            assertFalse(closed.get()); assertFalse(operation.exit().isDone());
            assertThrows(IllegalStateException.class, operation::check);
            assertThrows(InterruptedException.class, () -> operation.dataExited(new InterruptedException("cancelled")));
            operation.exit().get(5, TimeUnit.SECONDS); owner.drain(); assertTrue(closed.get());
            assertEquals("stopped", operation.snapshot().outcome);
        }
    }
    @Test public void handoffTimeoutReleasesNothingUntilAnActualHashExitsAndCannotPublish() throws Exception {
        CountDownLatch hashEntered = new CountDownLatch(1), release = new CountDownLatch(1);
        var worker = Executors.newSingleThreadExecutor();
        try (var fixture = new AttachmentBatchFileFixture(temporary.newFolder(), 1, () -> {}, () -> {})) {
            AtomicLong clock = new AtomicLong(); var capacity = new AttachmentCompletionCapacity(clock::get);
            var owner = new FramedSyncPayloadBudget("library", "generation");
            var operation = operation(fixture, owner, capacity, () -> {}, () -> {
                hashEntered.countDown();
                try { if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("test_hash_gate"); }
                catch (InterruptedException error) { throw new IllegalStateException(error); }
            });
            data(fixture, operation); operation.dataExited(null);
            int sequence = operation.snapshot().files.get(0).sequence; operation.queue.claim(List.of(sequence));
            var hash = worker.submit(() -> operation.verify(sequence));
            try {
                assertTrue(hashEntered.await(5, TimeUnit.SECONDS));
                clock.set(AttachmentCompletionQueue.HANDOFF_NANOS); operation.expire();
                assertFalse(operation.exit().isDone()); assertEquals(1, capacity.used());
                assertThrows(IllegalStateException.class, () -> fixture.store.lease(fixture.entries.get(0).key));
            } finally { release.countDown(); }
            assertThrows(ExecutionException.class, () -> hash.get(5, TimeUnit.SECONDS));
            operation.exit().get(5, TimeUnit.SECONDS);
            assertEquals(0, capacity.used()); assertFalse(fixture.store.resolve(fixture.entries.get(0).key, false).exists());
            try (AutoCloseable next = fixture.store.lease(fixture.entries.get(0).key)) { assertEquals(131072, fixture.store.resolve(fixture.entries.get(0).key, true).length()); }
        } finally { release.countDown(); worker.shutdownNow(); }
    }
    @Test public void incompleteBatchStillAllowsAnIndependentlySealedFileToFinish() throws Exception {
        try (var fixture = new AttachmentBatchFileFixture(temporary.newFolder(), 1, () -> {}, () -> {})) {
            var owner = new FramedSyncPayloadBudget("library", "generation");
            var operation = operation(fixture, owner, new AttachmentCompletionCapacity(), () -> {}, () -> {});
            operation.start();
            for (int i = 0; i < 3; i++) {
                var value = fixture.messages.get(i); operation.receiver.accept(operation.permission.accept(value, value.getSerializedSize()), value);
            }
            assertThrows(Exception.class, () -> operation.dataExited(new Exception("missing_batch_end")));
            assertEquals("data_failed", operation.snapshot().state);
            int sequence = operation.snapshot().files.get(0).sequence; operation.queue.claim(List.of(sequence));
            assertTrue(operation.verify(sequence)); operation.finalizeFile("publish", sequence); operation.receiver.settle(sequence, true); operation.changed();
            operation.exit().get(5, TimeUnit.SECONDS);
            assertEquals("failed", operation.snapshot().outcome); assertTrue(fixture.store.resolve(fixture.entries.get(0).key, false).exists());
        }
    }
}
