package com.foliole.android;

import com.foliole.android.framed.FramedSyncPayloadBudgetRegistry;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.After;
import org.junit.Test;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;

public class FolioleFolderSyncLeaseTest {
    private final FolioleFolderSyncLease lease = new FolioleFolderSyncLease();
    private final Object owner = new Object();
    private final LinkedBlockingQueue<Runnable> operations = new LinkedBlockingQueue<>();
    private final Executor files = operations::add;

    @After public void close() { lease.close(owner); }

    @Test public void rejectsAnotherWriterAndStaleLease() throws Exception {
        FramedSyncPayloadBudgetRegistry.configure("library", "generation");
        String id = lease.acquire(owner, files);
        lease.require(id, owner);
        try { lease.acquire(new Object(), files); throw new AssertionError("Accepted second writer"); }
        catch (IllegalStateException expected) { /* Existing owner is retained. */ }
        lease.release(id, owner);
        assertFalse(lease.busy());
        try { lease.require(id, owner); throw new AssertionError("Accepted stale lease"); }
        catch (SecurityException expected) { /* A released owner cannot write. */ }
    }

    @Test public void libraryReplacementDrainsQueuedFileWorkBeforeReleasingTheOldOwner() throws Exception {
        FramedSyncPayloadBudgetRegistry.configure("library", "before");
        String id = lease.acquire(owner, files);
        operations.add(() -> assertTrue(lease.busy()));
        CompletableFuture<Void> replacement = CompletableFuture.runAsync(() -> {
            try { FramedSyncPayloadBudgetRegistry.configure("library", "after"); }
            catch (InterruptedException error) { throw new IllegalStateException(error); }
        });
        operations.remove().run();
        Runnable cancel = operations.poll(2, TimeUnit.SECONDS);
        if (cancel == null) throw new AssertionError("Library replacement did not cancel folder work");
        try { lease.require(id, owner); throw new AssertionError("Accepted closed source"); }
        catch (SecurityException expected) { /* Old JS calls are rejected immediately. */ }
        assertFalse(replacement.isDone());
        cancel.run();
        replacement.get(2, TimeUnit.SECONDS);
        assertFalse(lease.busy());
        String next = lease.acquire(owner, files);
        lease.require(next, owner);
        lease.release(next, owner);
    }
}
