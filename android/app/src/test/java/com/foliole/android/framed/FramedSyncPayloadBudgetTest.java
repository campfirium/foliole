package com.foliole.android.framed;

import static org.junit.Assert.*;
import static com.foliole.android.framed.FramedSyncPayloadBudget.Direction.*;
import static com.foliole.android.framed.FramedSyncPayloadBudget.Lane.*;

import java.util.concurrent.*;
import org.junit.Test;

public final class FramedSyncPayloadBudgetTest {
    @Test public void twoSendersAndProviderSharePayloadWhileIncomingAndReceiptsCanProgress() throws Exception {
        var owner = new FramedSyncPayloadBudget("business.sqlite", "generation-1");
        var workers = Executors.newFixedThreadPool(2);
        try (var sender = owner.acquire(OUTBOUND, PAYLOAD);
             var incoming = owner.acquire(INBOUND, PAYLOAD);
             var sentReceipt = owner.acquire(OUTBOUND, RECEIPT);
             var receivedReceipt = owner.acquire(INBOUND, RECEIPT)) {
            assertEquals(4 * 1024 * 1024, sender.capacityBytes() + incoming.capacityBytes());
            assertEquals(1024 * 1024, sentReceipt.capacityBytes());
            var competing = new ExecutorCompletionService<FramedSyncPayloadBudget.Loan>(workers);
            competing.submit(() -> owner.acquire(OUTBOUND, PAYLOAD));
            competing.submit(() -> owner.acquire(OUTBOUND, PAYLOAD));
            assertNull(competing.poll(100, TimeUnit.MILLISECONDS));
            sender.close();
            var next = competing.poll(2, TimeUnit.SECONDS).get();
            assertNull(competing.poll(100, TimeUnit.MILLISECONDS));
            next.close();
            competing.poll(2, TimeUnit.SECONDS).get().close();
        } finally { owner.cancel(); owner.drain(); workers.shutdownNow(); }
    }

    @Test public void nativeTimeoutCannotGrantAgainUntilJsProducerAlsoReleases() throws Exception {
        var owner = new FramedSyncPayloadBudget("business.sqlite", "generation-1");
        var workers = Executors.newSingleThreadExecutor();
        var loan = owner.acquire(OUTBOUND, PAYLOAD);
        try {
            assertTrue(validate(owner, loan));
            assertTrue(validate(owner, loan)); // Same producer borrow, never another reservation.
            loan.close();
            loan.close();
            assertFalse(validate(owner, loan)); // A timed-out native consumer cannot grant a late producer.
            var next = workers.submit(() -> owner.acquire(OUTBOUND, PAYLOAD));
            blocked(next);
            release(owner, loan);
            try (var granted = next.get(2, TimeUnit.SECONDS)) {
                release(owner, loan); // Stale repeated release cannot retire the next loan.
                assertTrue(validate(owner, granted));
                release(owner, granted);
            }
        } finally { release(owner, loan); loan.close(); owner.cancel(); owner.drain(); workers.shutdownNow(); }
    }

    @Test public void closeCancelsWaitersButDrainsBothConsumerAndProducerHolders() throws Exception {
        var owner = new FramedSyncPayloadBudget("business.sqlite", "generation-1");
        var workers = Executors.newFixedThreadPool(2);
        var loan = owner.acquire(OUTBOUND, PAYLOAD);
        try {
            assertTrue(validate(owner, loan));
            var waiting = workers.submit(() -> owner.acquire(OUTBOUND, PAYLOAD));
            owner.cancel();
            try { waiting.get(2, TimeUnit.SECONDS); fail("closed waiter must fail"); }
            catch (ExecutionException error) { assertEquals("framed_sync_payload_budget_closed", error.getCause().getMessage()); }
            assertFalse(validate(owner, loan));
            var drain = workers.submit(() -> { owner.drain(); return true; });
            loan.close();
            blocked(drain);
            release(owner, loan);
            assertTrue(drain.get(2, TimeUnit.SECONDS));
        } finally { release(owner, loan); loan.close(); owner.cancel(); owner.drain(); workers.shutdownNow(); }
    }

    @Test public void librarySwitchWaitsForOldGenerationAndRejectsLateGrantsAndReleases() throws Exception {
        FramedSyncPayloadBudgetRegistry.configure("first.sqlite", "first-generation");
        var old = FramedSyncPayloadBudgetRegistry.current();
        var loan = old.acquire(OUTBOUND, PAYLOAD);
        var workers = Executors.newFixedThreadPool(2);
        try {
            assertTrue(validate(old, loan));
            var closedWaiter = workers.submit(() -> old.acquire(OUTBOUND, PAYLOAD));
            var switched = workers.submit(() -> {
                FramedSyncPayloadBudgetRegistry.configure("second.sqlite", "second-generation"); return true;
            });
            try { closedWaiter.get(2, TimeUnit.SECONDS); fail("old waiting request must cancel"); }
            catch (ExecutionException error) { assertEquals("framed_sync_payload_budget_closed", error.getCause().getMessage()); }
            loan.close();
            blocked(switched);
            assertSame(old, FramedSyncPayloadBudgetRegistry.current());
            FramedSyncPayloadBudgetRegistry.releaseProducer(loan.libraryKey(), loan.generationId(), loan.id(),
                OUTBOUND, PAYLOAD, loan.capacityBytes());
            assertTrue(switched.get(2, TimeUnit.SECONDS));
            var current = FramedSyncPayloadBudgetRegistry.current();
            assertNotSame(old, current);
            try (var newLoan = current.acquire(OUTBOUND, PAYLOAD)) {
                FramedSyncPayloadBudgetRegistry.releaseProducer(loan.libraryKey(), loan.generationId(), loan.id(),
                    OUTBOUND, PAYLOAD, loan.capacityBytes());
                assertTrue(validate(current, newLoan));
                release(current, newLoan);
            }
        } finally {
            release(old, loan); loan.close(); workers.shutdownNow();
            var current = FramedSyncPayloadBudgetRegistry.current();
            FramedSyncPayloadBudgetRegistry.close(current.libraryKey(), current.generationId());
        }
    }

    private static boolean validate(FramedSyncPayloadBudget owner, FramedSyncPayloadBudget.Loan loan) {
        return owner.validate(loan.libraryKey(), loan.generationId(), loan.id(), loan.direction(), loan.lane(), loan.capacityBytes());
    }

    private static void release(FramedSyncPayloadBudget owner, FramedSyncPayloadBudget.Loan loan) {
        owner.releaseProducer(loan.libraryKey(), loan.generationId(), loan.id(), loan.direction(), loan.lane(), loan.capacityBytes());
    }

    private static void blocked(Future<?> work) throws Exception {
        try { work.get(100, TimeUnit.MILLISECONDS); fail("loan must still be occupied"); }
        catch (TimeoutException expected) {}
    }
}
