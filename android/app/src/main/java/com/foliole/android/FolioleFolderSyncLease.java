package com.foliole.android;

import com.foliole.android.framed.FramedSyncPayloadBudget;
import com.foliole.android.framed.FramedSyncPayloadBudgetRegistry;
import java.util.UUID;
import java.util.concurrent.Executor;

/** The existing library lifecycle cancels this owner and drains its queued file I/O before replacement. */
final class FolioleFolderSyncLease {
    private String id;
    private Object owner;
    private FramedSyncPayloadBudget budget;
    private AutoCloseable registration;

    synchronized boolean busy() { return id != null; }

    synchronized String acquire(Object value, Executor files) {
        if (id != null) throw new IllegalStateException("folder_sync_busy");
        FramedSyncPayloadBudget current = FramedSyncPayloadBudgetRegistry.current();
        String next = UUID.randomUUID().toString();
        AutoCloseable active = current.operation(() -> {
            try { files.execute(() -> closeIfCurrent(next, value)); }
            catch (java.util.concurrent.RejectedExecutionException ignored) {
                // Plugin destruction enqueues owner cleanup before shutting down this executor.
            }
        });
        budget = current;
        registration = active;
        owner = value;
        id = next;
        return id;
    }

    synchronized void require(String value, Object holder) {
        requireIdentity(value, holder);
        if (budget.isClosed() || FramedSyncPayloadBudgetRegistry.current() != budget) {
            throw new SecurityException("folder_sync_library_changed");
        }
    }

    synchronized void release(String value, Object holder) {
        requireIdentity(value, holder);
        close(holder);
    }

    private void requireIdentity(String value, Object holder) {
        if (id == null || !id.equals(value) || holder != owner) throw new SecurityException("folder_sync_lease_invalid");
    }

    private synchronized void closeIfCurrent(String value, Object holder) {
        if (value.equals(id)) close(holder);
    }

    synchronized void close(Object holder) {
        if (owner != holder) return;
        try { registration.close(); }
        catch (Exception error) { throw new IllegalStateException("folder_sync_lease_close_failed", error); }
        finally { id = null; owner = null; budget = null; registration = null; }
    }
}
