package com.foliole.android.framed;

import static org.junit.Assert.*;
import static com.foliole.android.framed.FramedSyncPayloadBudget.Direction.OUTBOUND;
import static com.foliole.android.framed.FramedSyncPayloadBudget.Lane.PAYLOAD;
import java.util.ArrayList;
import java.util.concurrent.*;
import org.junit.Test;

public final class FramedSyncDocumentBudgetTest {
    @Test public void failedNavigationKeepsOwnerAndNullCaptureDoesNotRetireNewOwner() throws Exception {
        var old = new FramedSyncPayloadBudget("library", "old");
        var next = new FramedSyncPayloadBudget("library", "new");
        var canceled = new ArrayList<FramedSyncPayloadBudget>();
        var document = new FramedSyncDocumentBudget(canceled::add);
        document.started(old);
        assertFalse(old.isClosed()); // No commit, including failed navigation.
        document.started(null);
        document.committed();
        assertFalse(old.isClosed());
        assertFalse(next.isClosed());
        assertTrue(canceled.isEmpty());
        document.started(old);
        document.committed();
        assertEquals(java.util.List.of(old), canceled);
        assertTrue(old.isClosed());
        assertFalse(next.isClosed());
    }

    @Test public void committedReplacementDropsProducerButWaitsForNativeConsumerBeforeNewGeneration() throws Exception {
        var old = FramedSyncPayloadBudgetRegistry.configure("document-test", "old");
        var loan = old.acquire(OUTBOUND, PAYLOAD);
        assertTrue(old.validate(loan.libraryKey(), loan.generationId(), loan.id(), OUTBOUND, PAYLOAD, loan.capacityBytes()));
        var document = new FramedSyncDocumentBudget(owner -> {});
        var worker = Executors.newSingleThreadExecutor();
        try {
            document.started(old);
            document.committed();
            var replacement = worker.submit(() -> FramedSyncPayloadBudgetRegistry.configure("document-test", "new"));
            try { replacement.get(100, TimeUnit.MILLISECONDS); fail("native consumer still owns payload"); }
            catch (TimeoutException expected) {}
            loan.close();
            var next = replacement.get(2, TimeUnit.SECONDS);
            old.releaseProducer(loan.libraryKey(), loan.generationId(), loan.id(), OUTBOUND, PAYLOAD, loan.capacityBytes());
            assertFalse(next.isClosed());
            try (var nextLoan = next.acquire(OUTBOUND, PAYLOAD)) { assertNotEquals(loan.id(), nextLoan.id()); }
            FramedSyncPayloadBudgetRegistry.close("document-test", "new");
        } finally { loan.close(); worker.shutdownNow(); }
    }

    @Test public void rendererGoneRetiresOnlyBoundAndCapturedOwners() {
        var old = new FramedSyncPayloadBudget("library", "old");
        var bound = new FramedSyncPayloadBudget("library", "bound");
        var unrelated = new FramedSyncPayloadBudget("library", "new");
        var document = new FramedSyncDocumentBudget(owner -> {});
        document.started(old);
        document.gone(bound);
        assertTrue(old.isClosed());
        assertTrue(bound.isClosed());
        assertFalse(unrelated.isClosed());
    }
}
