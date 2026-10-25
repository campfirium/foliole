package com.foliole.android.framed;

import static org.junit.Assert.*;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Test;

public final class AttachmentCompletionQueueTest {
    private static int seal(AttachmentCompletionQueue queue) throws Exception {
        try (var reservation = queue.reserve()) {
            reservation.seal("key", 1, () -> {}, () -> {}); return reservation.sequence;
        }
    }
    @Test public void lostNotificationAndClaimReplyLeaveTheFactAndQuotaUntilSettlement() throws Exception {
        var capacity = new AttachmentCompletionCapacity();
        var queue = new AttachmentCompletionQueue(capacity, () -> {});
        int first = seal(queue);
        assertFalse(queue.read().get(0).claimed);
        queue.claim(List.of(first)); queue.claim(List.of(first));
        assertTrue(queue.read().get(0).claimed); assertEquals(1, capacity.used());
        queue.settle(first, true); queue.settle(first, true);
        assertTrue(queue.read().isEmpty()); assertEquals(0, capacity.used());
        assertThrows(IllegalStateException.class, () -> queue.settle(first, false));
    }
    @Test public void fourCompletionsAcrossBatchesBackpressureTheFifthUntilSqlSettlement() throws Exception {
        var capacity = new AttachmentCompletionCapacity();
        var old = new AttachmentCompletionQueue(capacity, () -> {});
        var next = new AttachmentCompletionQueue(capacity, () -> {});
        int first = seal(old); seal(old); seal(next); seal(next);
        old.claim(List.of(first));
        var worker = Executors.newSingleThreadExecutor();
        CountDownLatch entered = new CountDownLatch(1);
        var blocked = worker.submit(() -> { entered.countDown(); return next.reserve(); });
        try {
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            assertThrows(java.util.concurrent.TimeoutException.class, () -> blocked.get(100, TimeUnit.MILLISECONDS));
            old.settle(first, true);
            try (var reservation = blocked.get(5, TimeUnit.SECONDS)) { assertEquals(4, capacity.used()); }
        } finally {
            old.stop(); next.stop(); old.releaseUnclaimed(); next.releaseUnclaimed(); worker.shutdownNow();
        }
        assertEquals(0, capacity.used());
    }
    @Test public void stoppingUnblocksCapacityButRetainsClaimedOwnershipUntilTheConsumerExits() throws Exception {
        var capacity = new AttachmentCompletionCapacity(); var queue = new AttachmentCompletionQueue(capacity, () -> {});
        int first = seal(queue); seal(queue); seal(queue); seal(queue); queue.claim(List.of(first));
        var worker = Executors.newSingleThreadExecutor();
        var blocked = worker.submit(queue::reserve);
        try {
            queue.stop();
            assertThrows(java.util.concurrent.ExecutionException.class, () -> blocked.get(5, TimeUnit.SECONDS));
            queue.releaseUnclaimed(); assertEquals(1, capacity.used());
            assertEquals(first, queue.read().get(0).sequence);
            queue.settle(first, false); assertEquals(0, capacity.used());
        } finally { worker.shutdownNow(); }
    }
    @Test public void completionCannotBeObservedBeforeTheRealWriterCloses() throws Exception {
        var capacity = new AttachmentCompletionCapacity(); AtomicInteger events = new AtomicInteger();
        var queue = new AttachmentCompletionQueue(capacity, events::incrementAndGet);
        try (var reservation = queue.reserve()) {
            assertThrows(Exception.class, () -> reservation.seal("key", 1, () -> { throw new Exception("close_failed"); }, () -> {}));
            assertTrue(queue.read().isEmpty()); assertEquals(0, events.get()); assertEquals(1, capacity.used());
        }
        assertEquals(0, capacity.used());
    }
    @Test public void lostHandoffExpiresEvenWhileAnotherClaimedFileMakesHashProgress() throws Exception {
        AtomicLong time = new AtomicLong(); var capacity = new AttachmentCompletionCapacity(time::get);
        var claimed = new AttachmentCompletionQueue(capacity, () -> {});
        var lost = new AttachmentCompletionQueue(capacity, () -> {});
        int first = seal(claimed); claimed.claim(List.of(first)); seal(lost);
        time.set(AttachmentCompletionQueue.HANDOFF_NANOS - 1); capacity.progress();
        time.incrementAndGet();
        assertFalse(claimed.expire()); assertTrue(lost.expire());
        lost.releaseUnclaimed(); claimed.settle(first, true); assertEquals(0, capacity.used());
    }
    @Test public void failedBatchCanKeepAnIndependentlySealedFileForTheSharedConsumer() throws Exception {
        var capacity = new AttachmentCompletionCapacity(); var queue = new AttachmentCompletionQueue(capacity, () -> {});
        int complete = seal(queue); queue.claim(List.of(complete));
        queue.stop(); queue.releaseUnclaimed();
        assertEquals(1, queue.read().size()); queue.settle(complete, true); assertEquals(0, capacity.used());
    }
}
