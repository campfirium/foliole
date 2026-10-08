package com.foliole.android;

import static org.junit.Assert.*;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public final class FolioleCompanionSyncGroupDataPendingTest {
    @Test public void replacementCancelsOnlyCapturedGenerationAndQueuedOldEventDoesNotDispatch() {
        var pending = new FolioleCompanionSyncGroupDataPending();
        var old = new FramedSyncPayloadBudget("library", "old");
        var next = new FramedSyncPayloadBudget("library", "new");
        var oldReply = pending.register("old-request", old);
        var newReply = pending.register("new-request", next);
        var dispatched = new AtomicInteger();
        Runnable oldQueued = () -> { if (pending.contains("old-request")) dispatched.incrementAndGet(); };
        Runnable newQueued = () -> { if (pending.contains("new-request")) dispatched.incrementAndGet(); };
        old.invalidateDocument();
        pending.cancelOwner(old);
        oldQueued.run();
        assertEquals(0, dispatched.get());
        newQueued.run();
        assertEquals(1, dispatched.get());
        assertTrue(oldReply.isCompletedExceptionally());
        assertFalse(oldReply.complete(null));
        assertFalse(newReply.isDone());
        assertNull(pending.future("old-request"));
        assertSame(newReply, pending.future("new-request"));
        assertTrue(pending.register("late-old", old).isCompletedExceptionally());
        assertFalse(pending.contains("late-old"));
        pending.close();
    }
}
