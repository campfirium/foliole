package com.foliole.android;

import android.content.Context;
import com.foliole.android.framed.AttachmentFileStore;
import com.foliole.android.framed.FramedSyncPayloadBudget;
import java.io.File;
import java.io.RandomAccessFile;
import java.util.HashMap;
import java.util.Map;

/** Counts actual file users so retiring an owner cannot close another thread's descriptor. */
final class FolioleAttachmentBlockOwner {
    static final class Source implements AutoCloseable {
        final RandomAccessFile file;
        final AutoCloseable lease;
        Source(File path, AutoCloseable lease) throws Exception { this.file = new RandomAccessFile(path, "r"); this.lease = lease; }
        @Override public void close() throws Exception { try { file.close(); } finally { lease.close(); } }
    }
    final AttachmentFileStore store;
    final FramedSyncPayloadBudget owner;
    final Map<String, Source> sources = new HashMap<>();
    private int users;
    private boolean disposed;

    FolioleAttachmentBlockOwner(Context context, FramedSyncPayloadBudget owner) throws Exception {
        store = new AttachmentFileStore(FolioleAttachmentMaintenanceFiles.directory(context, false)); this.owner = owner;
    }
    synchronized AutoCloseable use() {
        check();
        AutoCloseable lifetime = owner.operation(() -> {});
        users++;
        var released = new java.util.concurrent.atomic.AtomicBoolean();
        return () -> {
            if (!released.compareAndSet(false, true)) return;
            try { synchronized (this) { users--; retire(); } } finally { lifetime.close(); }
        };
    }
    void check() { if (owner.isClosed()) throw new IllegalStateException("attachment_owner_closed"); }
    synchronized void retire() throws Exception {
        if (!owner.isClosed() || users != 0 || disposed) return;
        disposed = true;
        Exception failure = null;
        for (Source source : sources.values()) {
            try { source.close(); } catch (Exception error) { failure = error; }
        }
        sources.clear();
        try { store.close(); } catch (Exception error) { failure = error; }
        if (failure != null) throw failure;
    }
}
