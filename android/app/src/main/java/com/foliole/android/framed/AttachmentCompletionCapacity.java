package com.foliole.android.framed;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.LongSupplier;

/** All batches of one library generation share four metadata reservations, including the active file. */
public final class AttachmentCompletionCapacity {
    public static final int SLOTS = 4;
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition changed = lock.newCondition();
    private final LongSupplier clock;
    private int used;
    private volatile long hashProgress;

    public AttachmentCompletionCapacity() { this(System::nanoTime); }
    public AttachmentCompletionCapacity(LongSupplier clock) { this.clock = clock; hashProgress = clock.getAsLong(); }
    public long now() { return clock.getAsLong(); }
    public long hashProgress() { return hashProgress; }
    public void progress() { hashProgress = now(); }
    public AutoCloseable reserve(Runnable check) throws InterruptedException {
        lock.lockInterruptibly();
        try {
            while (used == SLOTS) { check.run(); changed.await(); }
            check.run(); used++;
        } finally { lock.unlock(); }
        var released = new AtomicBoolean();
        return () -> {
            if (!released.compareAndSet(false, true)) return;
            lock.lock(); try { used--; changed.signalAll(); } finally { lock.unlock(); }
        };
    }
    public void wake() { lock.lock(); try { changed.signalAll(); } finally { lock.unlock(); } }
    public int used() { lock.lock(); try { return used; } finally { lock.unlock(); } }
}
