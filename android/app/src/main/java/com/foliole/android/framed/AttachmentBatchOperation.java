package com.foliole.android.framed;

import java.util.List;
import java.util.concurrent.*;

/** One HTTP data operation may exit before its bounded completion handoff settles. */
public final class AttachmentBatchOperation {
    private static final ScheduledExecutorService DEADLINES = Executors.newSingleThreadScheduledExecutor();
    public final String id;
    public final FramedSyncPayloadBudget owner;
    public final AttachmentCompletionQueue queue;
    public final AttachmentBatchReceiver receiver;
    public final AttachmentBatchFinalizer finalizer;
    public final AttachmentBatchAuthorization permission;
    public final FramedSyncSessionContext context;
    public final String initiatorEpoch;
    private final AttachmentCompletionCapacity capacity;
    private final Runnable wake, cancelData;
    private final AutoCloseable filesUse, lifetime;
    private final CompletableFuture<Void> exited = new CompletableFuture<>();
    private ScheduledFuture<?> deadline;
    private String state = "prepared", failure = "";
    private long dataProgress;
    private int active;
    private boolean dataExited, releasing, released;
    private volatile boolean stopped;

    public AttachmentBatchOperation(String id, FramedSyncPayloadBudget owner, AttachmentFileStore store,
        java.util.concurrent.Callable<AutoCloseable> acquireFiles, AttachmentCompletionCapacity capacity,
        byte[] requestId, List<AttachmentBatchAuthorization.Entry> entries, FramedSyncSessionContext context,
        String initiatorEpoch, String algorithm, Runnable wake, Runnable cancelData) throws Exception {
        this(id, owner, store, acquireFiles, capacity, requestId, entries, context, initiatorEpoch, algorithm, wake, cancelData, () -> {});
    }
    AttachmentBatchOperation(String id, FramedSyncPayloadBudget owner, AttachmentFileStore store,
        java.util.concurrent.Callable<AutoCloseable> acquireFiles, AttachmentCompletionCapacity capacity,
        byte[] requestId, List<AttachmentBatchAuthorization.Entry> entries, FramedSyncSessionContext context,
        String initiatorEpoch, String algorithm, Runnable wake, Runnable cancelData, Runnable hashProgress) throws Exception {
        this.id = id; this.owner = owner; this.cancelData = cancelData; this.capacity = capacity; this.context = context; this.initiatorEpoch = initiatorEpoch; this.wake = wake;
        permission = new AttachmentBatchAuthorization(requestId, entries);
        queue = new AttachmentCompletionQueue(capacity, this::changed);
        receiver = new AttachmentBatchReceiver(store, queue, entries, () -> { check(); progress(); });
        finalizer = new AttachmentBatchFinalizer(receiver, algorithm, this::check, () -> { capacity.progress(); hashProgress.run(); }, this::commit);
        filesUse = acquireFiles.call();
        dataProgress = capacity.now();
        var cancelled = new java.util.concurrent.atomic.AtomicBoolean();
        var ready = new java.util.concurrent.atomic.AtomicReference<Runnable>();
        try { lifetime = owner.operation(() -> {
            cancelled.set(true); Runnable cancel = ready.get(); if (cancel != null) cancel.run();
        }); }
        catch (Exception error) { filesUse.close(); throw error; }
        ready.set(this::stop);
        if (cancelled.get()) stop(); else schedule();
    }
    private synchronized boolean commit(java.util.concurrent.Callable<Boolean> publish) throws Exception {
        check(); return owner.publish(publish);
    }
    public void check() { if (stopped || owner.isClosed()) throw new IllegalStateException("attachment_batch_stopped"); }
    public synchronized void start() {
        check();
        if (!state.equals("prepared")) throw new IllegalStateException("attachment_batch_already_started");
        state = "receiving"; active++; dataProgress = capacity.now();
    }
    public void progress() { synchronized (this) { dataProgress = capacity.now(); } }
    public void dataExited(Exception error) throws Exception {
        try { receiver.close(); }
        catch (Exception closeError) { if (error == null) error = closeError; else error.addSuppressed(closeError); }
        synchronized (this) {
            active--; dataExited = true;
            if (stopped) state = "stopped";
            else if (error != null) { state = "data_failed"; failure = error.toString(); }
            else { receiver.result(); state = "data_complete"; }
        }
        changed();
        if (error != null) throw error;
    }
    public void stop() {
        synchronized (this) {
            if (stopped || released) return;
            stopped = true; failure = "attachment_batch_stopped";
            if (state.equals("prepared")) dataExited = true;
            state = "stopped";
        }
        queue.stop(); cancelData.run(); changed();
    }
    public boolean verify(int sequence) throws Exception {
        begin();
        try { return finalizer.verify(sequence); }
        finally { finish(); }
    }
    public void finalizeFile(String action, int sequence) throws Exception {
        begin();
        try { if (action.equals("publish")) finalizer.publish(sequence); else finalizer.discard(sequence); }
        finally { finish(); }
    }
    private synchronized void begin() { check(); active++; }
    private void finish() { synchronized (this) { active--; notifyAll(); } changed(); }
    public CompletableFuture<Void> exit() { return exited; }
    public synchronized boolean closed() { return released; }
    public void changed() {
        boolean release;
        synchronized (this) {
            release = !released && !releasing && dataExited && active == 0 && (stopped || queue.read().isEmpty());
            if (release) releasing = true;
        }
        if (release) {
            Exception failure = null;
            try { if (stopped) queue.releaseAllAfterExit(); } catch (Exception error) { failure = error; }
            try { filesUse.close(); } catch (Exception error) { failure = error; }
            try { lifetime.close(); } catch (Exception error) { failure = error; }
            synchronized (this) {
                released = true; releasing = false;
                if (failure != null) { this.failure = failure.toString(); if (!stopped) state = "data_failed"; }
            }
            if (failure == null) exited.complete(null); else exited.completeExceptionally(failure);
        }
        schedule(); wake.run();
    }
    private void schedule() {
        synchronized (this) {
            if (deadline != null) deadline.cancel(false);
            if (released || releasing) return;
            long next = queue.nextDeadline();
            if (!dataExited) next = Math.min(next, dataDeadline());
            if (next == Long.MAX_VALUE) return;
            deadline = DEADLINES.schedule(this::expire, Math.max(1, next - capacity.now()), TimeUnit.NANOSECONDS);
        }
    }
    private long dataDeadline() {
        long progress = receiver.waitingForCapacity() ? Math.max(dataProgress, capacity.hashProgress()) : dataProgress;
        return progress + AttachmentCompletionQueue.HANDOFF_NANOS;
    }
    public void expire() {
        boolean expired;
        synchronized (this) { expired = !dataExited && capacity.now() >= dataDeadline(); }
        if (queue.expire() || expired) stop(); else schedule();
    }
    public static final class Snapshot {
        public final String state, outcome, error;
        public final List<AttachmentCompletionQueue.FileFact> files;
        public final List<AttachmentCompletionQueue.Settlement> settlements;
        public final List<AttachmentBatchReceiver.ResultEntry> entries;
        public final int active, bytes, blocks;
        Snapshot(String state, String outcome, String error, List<AttachmentCompletionQueue.FileFact> files,
            List<AttachmentCompletionQueue.Settlement> settlements, List<AttachmentBatchReceiver.ResultEntry> entries, int active, int bytes, int blocks) {
            this.state = state; this.outcome = outcome; this.error = error; this.files = files;
            this.settlements = settlements; this.entries = entries; this.active = active; this.bytes = bytes; this.blocks = blocks;
        }
    }
    public synchronized Snapshot snapshot() {
        String outcome = state.equals("data_complete") ? "complete" : stopped ? "stopped" : "failed";
        return new Snapshot(released ? "closed" : state, released ? outcome : "", failure, queue.read(), queue.settlements(),
            state.equals("data_complete") ? receiver.result() : null, active, receiver.bytes(), receiver.blocks());
    }
}
