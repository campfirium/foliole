package com.foliole.android.framed;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

/** Logical payload slots shared by every connection of one business-library generation. */
public final class FramedSyncPayloadBudget {
    public static final int PAYLOAD_BYTES = 2 * 1024 * 1024;
    public static final int RECEIPT_BYTES = 1024 * 1024;
    public enum Direction { INBOUND, OUTBOUND }
    public enum Lane { PAYLOAD, RECEIPT }

    private final String libraryKey;
    private final String generationId;
    private final ReentrantLock lock = new ReentrantLock(true);
    private final Condition changed = lock.newCondition();
    private final Map<Integer, Loan> loans = new HashMap<>();
    private volatile boolean closed;

    public FramedSyncPayloadBudget(String libraryKey, String generationId) {
        if (libraryKey == null || libraryKey.isEmpty() || generationId == null || generationId.isEmpty()) {
            throw new IllegalArgumentException("framed_sync_payload_budget_identity_invalid");
        }
        this.libraryKey = libraryKey;
        this.generationId = generationId;
    }

    public String libraryKey() { return libraryKey; }
    public String generationId() { return generationId; }
    public boolean isClosed() { return closed; }

    /** Explicit unmanaged core overloads pass null; production callers supply their captured owner. */
    static Loan borrow(FramedSyncPayloadBudget owner, Direction direction, Lane lane) throws InterruptedException {
        return owner == null ? null : owner.acquire(direction, lane);
    }

    public Loan acquire(Direction direction, Lane lane) throws InterruptedException {
        int slot = direction.ordinal() * 2 + lane.ordinal();
        lock.lockInterruptibly();
        try {
            while (!closed && loans.containsKey(slot)) changed.await();
            if (closed) throw new IllegalStateException("framed_sync_payload_budget_closed");
            Loan loan = new Loan(slot, direction, lane);
            loans.put(slot, loan);
            return loan;
        } finally { lock.unlock(); }
    }

    public void cancel() {
        lock.lock();
        try { closed = true; changed.signalAll(); }
        finally { lock.unlock(); }
    }

    /** The old document can no longer deliver through its product bridge; native consumers still drain. */
    public void invalidateDocument() {
        lock.lock();
        try {
            closed = true;
            var entries = loans.values().iterator();
            while (entries.hasNext()) {
                Loan loan = entries.next();
                loan.producerHeld = false;
                if (!loan.nativeHeld) entries.remove();
            }
            changed.signalAll();
        } finally { lock.unlock(); }
    }

    public void drain() throws InterruptedException {
        lock.lockInterruptibly();
        try { while (!loans.isEmpty()) changed.await(); }
        finally { lock.unlock(); }
    }

    public boolean validate(String library, String generation, String id,
        Direction direction, Lane lane, int capacity) {
        lock.lock();
        try {
            Loan loan = loans.get(direction.ordinal() * 2 + lane.ordinal());
            if (closed || !matches(loan, library, generation, id, capacity) || !loan.nativeHeld) return false;
            loan.producerHeld = true;
            return true;
        } finally { lock.unlock(); }
    }

    public void releaseProducer(String library, String generation, String id,
        Direction direction, Lane lane, int capacity) {
        lock.lock();
        try {
            Loan loan = loans.get(direction.ordinal() * 2 + lane.ordinal());
            if (!matches(loan, library, generation, id, capacity)) return;
            loan.producerHeld = false;
            retire(loan);
        } finally { lock.unlock(); }
    }

    private boolean matches(Loan loan, String library, String generation, String id, int capacity) {
        return libraryKey.equals(library) && generationId.equals(generation) && loan != null &&
            loan.id.equals(id) && loan.capacityBytes() == capacity;
    }

    private void retire(Loan loan) {
        if (!loan.nativeHeld && !loan.producerHeld && loans.get(loan.slot) == loan) {
            loans.remove(loan.slot);
            changed.signalAll();
        }
    }

    public final class Loan implements AutoCloseable {
        private final String id = UUID.randomUUID().toString();
        private final int slot;
        private final Direction direction;
        private final Lane lane;
        private boolean nativeHeld = true;
        private boolean producerHeld;

        private Loan(int slot, Direction direction, Lane lane) {
            this.slot = slot;
            this.direction = direction;
            this.lane = lane;
        }

        public String id() { return id; }
        public String libraryKey() { return libraryKey; }
        public String generationId() { return generationId; }
        public Direction direction() { return direction; }
        public Lane lane() { return lane; }
        public int capacityBytes() { return lane == Lane.PAYLOAD ? PAYLOAD_BYTES : RECEIPT_BYTES; }

        @Override public void close() {
            lock.lock();
            try {
                nativeHeld = false;
                retire(this);
            } finally { lock.unlock(); }
        }
    }
}
