package com.foliole.android.framed;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** Retained completion facts. Notifications never carry ownership or release a reservation. */
public final class AttachmentCompletionQueue {
    public static final long HANDOFF_NANOS = TimeUnit.SECONDS.toNanos(60);
    public static final class FileFact {
        public final int sequence;
        public final String key;
        public final long length;
        public final boolean claimed;
        private FileFact(Record record) {
            sequence = record.sequence; key = record.key; length = record.length; claimed = record.claimed;
        }
    }
    private static final class Record {
        final int sequence;
        final String key;
        final long length, sealedAt;
        final AutoCloseable release;
        boolean claimed;
        Boolean settling;
        final java.util.concurrent.CompletableFuture<Void> terminal = new java.util.concurrent.CompletableFuture<>();
        Record(int sequence, String key, long length, long now, AutoCloseable release) {
            this.sequence = sequence; this.key = key; this.length = length; sealedAt = now; this.release = release;
        }
    }
    private final AttachmentCompletionCapacity capacity;
    private final Runnable changed;
    private final Map<Integer, Record> records = new HashMap<>();
    private final Map<Integer, Boolean> settled = new HashMap<>();
    private volatile boolean stopped;
    private int nextSequence;

    public AttachmentCompletionQueue(AttachmentCompletionCapacity capacity, Runnable changed) {
        this.capacity = capacity; this.changed = changed;
    }
    public void check() { if (stopped) throw new IllegalStateException("attachment_batch_stopped"); }
    public Reservation reserve() throws Exception {
        AutoCloseable release = capacity.reserve(this::check);
        synchronized (this) {
            try {
                check();
                if (nextSequence == AttachmentBatchAuthorization.MAX_ENTRIES) throw new IllegalStateException("attachment_batch_entry_limit");
                return new Reservation(++nextSequence, release);
            }
            catch (Exception error) { release.close(); throw error; }
        }
    }
    public synchronized List<FileFact> read() {
        var result = new ArrayList<FileFact>();
        for (Record record : records.values()) result.add(new FileFact(record));
        result.sort(java.util.Comparator.comparingInt(value -> value.sequence));
        return List.copyOf(result);
    }
    public void claim(List<Integer> sequences) {
        boolean notify = false;
        synchronized (this) {
            check();
            for (int sequence : sequences) {
                if (!records.containsKey(sequence) && !settled.containsKey(sequence)) throw missing();
            }
            for (int sequence : sequences) {
                Record record = records.get(sequence);
                if (record != null && !record.claimed) { record.claimed = true; notify = true; }
            }
        }
        if (notify) changed.run();
    }
    public void settle(int sequence, boolean published) throws Exception {
        Record record;
        boolean first;
        synchronized (this) {
            Boolean previous = settled.get(sequence);
            if (previous != null) {
                if (previous != published) throw new IllegalStateException("attachment_settlement_changed");
                return;
            }
            record = records.get(sequence);
            if (record == null || !record.claimed) throw missing();
            first = record.settling == null;
            if (!first && record.settling != published) throw new IllegalStateException("attachment_settlement_changed");
            record.settling = published;
        }
        if (!first) { record.terminal.get(); return; }
        Exception failure = null;
        try { record.release.close(); } catch (Exception error) { failure = error; }
        synchronized (this) { records.remove(sequence); settled.put(sequence, published); }
        if (failure == null) record.terminal.complete(null); else record.terminal.completeExceptionally(failure);
        changed.run();
        if (failure != null) throw failure;
    }
    public static final class Settlement {
        public final int sequence;
        public final boolean published;
        Settlement(int sequence, boolean published) { this.sequence = sequence; this.published = published; }
    }
    public synchronized List<Settlement> settlements() {
        return settled.entrySet().stream().sorted(Map.Entry.comparingByKey())
            .map(entry -> new Settlement(entry.getKey(), entry.getValue())).collect(java.util.stream.Collectors.toUnmodifiableList());
    }
    public synchronized void requireClaimed(int sequence) {
        check();
        Record record = records.get(sequence);
        if (record == null || !record.claimed) throw missing();
    }
    public synchronized long nextDeadline() {
        long result = Long.MAX_VALUE;
        for (Record record : records.values()) {
            long progress = record.claimed ? Math.max(record.sealedAt, capacity.hashProgress()) : record.sealedAt;
            result = Math.min(result, progress + HANDOFF_NANOS);
        }
        return result;
    }
    public boolean expire() {
        synchronized (this) {
            if (stopped || capacity.now() < nextDeadline()) return false;
            stopped = true;
        }
        capacity.wake(); changed.run(); return true;
    }
    public void stop() {
        synchronized (this) { if (stopped) return; stopped = true; }
        capacity.wake(); changed.run();
    }
    /** Call only after the data writer exits; claimed records remain until their consumer settles. */
    public void releaseUnclaimed() throws Exception {
        List<Record> abandoned = new ArrayList<>();
        synchronized (this) {
            if (!stopped) throw new IllegalStateException("attachment_batch_running");
            var iterator = records.values().iterator();
            while (iterator.hasNext()) {
                Record record = iterator.next();
                if (!record.claimed) { abandoned.add(record); iterator.remove(); }
            }
        }
        Exception failure = null;
        for (Record record : abandoned) {
            try { record.release.close(); } catch (Exception error) { failure = error; }
        }
        changed.run();
        if (failure != null) throw failure;
    }
    public void releaseAllAfterExit() throws Exception {
        List<Record> abandoned;
        synchronized (this) {
            if (!stopped) throw new IllegalStateException("attachment_batch_running");
            abandoned = List.copyOf(records.values()); records.clear();
            for (Record record : abandoned) settled.put(record.sequence, false);
        }
        Exception failure = null;
        for (Record record : abandoned) {
            try { record.release.close(); } catch (Exception error) { failure = error; }
        }
        if (failure != null) throw failure;
    }
    private static IllegalStateException missing() { return new IllegalStateException("attachment_completion_missing"); }

    public final class Reservation implements AutoCloseable {
        public final int sequence;
        private AutoCloseable release;
        private Reservation(int sequence, AutoCloseable release) { this.sequence = sequence; this.release = release; }
        /** closeWriter must have closed the actual file before a fact can become visible. */
        public void seal(String key, long length, AutoCloseable closeWriter, AutoCloseable ownership) throws Exception {
            closeWriter.close();
            synchronized (AttachmentCompletionQueue.this) {
                check();
                if (release == null) throw new IllegalStateException("attachment_reservation_closed");
                AutoCloseable slot = release;
                records.put(sequence, new Record(sequence, key, length, capacity.now(), () -> {
                    try { ownership.close(); } finally { slot.close(); }
                }));
                release = null;
            }
            changed.run();
        }
        @Override public void close() throws Exception {
            AutoCloseable slot;
            synchronized (AttachmentCompletionQueue.this) { slot = release; release = null; }
            if (slot != null) slot.close();
        }
    }
}
