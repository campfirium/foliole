package com.foliole.android.framed;

import com.foliole.sync.v22.RequestAttachment;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Authenticated frame effects and sealed-file ownership. Shared code still decides verification and publication. */
public final class AttachmentBatchReceiver implements AutoCloseable {
    public static final class ResultEntry {
        public final String key, state;
        public final long length, offset;
        public final int blocks;
        public final boolean pending;
        ResultEntry(RequestAttachment value, int blocks) {
            key = value.getStorageKey(); state = value.getState(); length = value.getByteLength();
            offset = value.getOffset(); pending = value.getPending(); this.blocks = blocks;
        }
    }
    static final class Completed {
        final String key;
        final long length;
        boolean busy, verified, published;
        Completed(String key, long length) { this.key = key; this.length = length; }
    }
    final AttachmentFileStore store;
    final AttachmentCompletionQueue queue;
    private final Map<String, AttachmentBatchAuthorization.Entry> entries = new HashMap<>();
    final Map<Integer, Completed> completed = new HashMap<>();
    private final List<ResultEntry> results = new ArrayList<>();
    private AttachmentFileStore.Receive writer;
    private AttachmentCompletionQueue.Reservation reservation;
    private int currentBlocks, blocks, bytes;
    private final AttachmentFileStore.Check check;
    private boolean ended;
    private volatile boolean waitingForCapacity;
    public boolean waitingForCapacity() { return waitingForCapacity; }

    public AttachmentBatchReceiver(AttachmentFileStore store, AttachmentCompletionQueue queue,
        List<AttachmentBatchAuthorization.Entry> entries, AttachmentFileStore.Check check) {
        this.store = store; this.queue = queue; this.check = check;
        for (var entry : entries) this.entries.put(entry.key, entry);
    }
    public void accept(AttachmentBatchAuthorization.Event event, RequestAttachment value) throws Exception {
        check.run(); queue.check();
        switch (event) {
            case DESCRIPTION: open(value); break;
            case BLOCK:
                writer.append(value.getOffset(), value.getData().asReadOnlyByteBuffer());
                currentBlocks++; blocks++; bytes += value.getData().size(); break;
            case FILE_END: seal(value); break;
            case RANGE_END: close(); results.add(new ResultEntry(value, currentBlocks)); break;
            case RESTART:
            case UNAVAILABLE: results.add(new ResultEntry(value, 0)); break;
            case BATCH_END: ended = true; break;
        }
    }
    private void open(RequestAttachment value) throws Exception {
        if (writer != null || reservation != null) throw new IllegalStateException("attachment_writer_open");
        var entry = entries.get(value.getStorageKey());
        waitingForCapacity = true;
        try { reservation = queue.reserve(); } finally { waitingForCapacity = false; }
        try {
            check.run(); writer = store.receive(entry.key, entry.start, entry.partialLength, () -> { check.run(); queue.check(); });
            currentBlocks = 0;
        } catch (Exception error) { close(); throw error; }
    }
    private void seal(RequestAttachment value) throws Exception {
        AttachmentFileStore.Receive sealed = writer;
        int sequence = reservation.sequence;
        synchronized (this) { completed.put(sequence, new Completed(value.getStorageKey(), value.getByteLength())); }
        try { reservation.seal(value.getStorageKey(), value.getByteLength(), sealed::seal, sealed); }
        catch (Exception error) { synchronized (this) { completed.remove(sequence); } throw error; }
        writer = null; reservation = null;
        results.add(new ResultEntry(value, currentBlocks));
    }
    public synchronized List<ResultEntry> result() {
        if (!ended) throw new IllegalStateException("attachment_batch_incomplete");
        return List.copyOf(results);
    }
    public int bytes() { return bytes; }
    public int blocks() { return blocks; }
    public synchronized AutoCloseable begin(int sequence) {
        queue.requireClaimed(sequence);
        Completed file = completed.get(sequence);
        if (file == null || file.busy) throw new IllegalStateException("attachment_completion_busy");
        file.busy = true;
        return () -> { synchronized (this) { file.busy = false; notifyAll(); } };
    }
    public synchronized Completed file(int sequence) {
        Completed value = completed.get(sequence);
        if (value == null) throw new IllegalStateException("attachment_completion_missing");
        return value;
    }
    public void settle(int sequence, boolean published) throws Exception {
        synchronized (this) {
            Completed file = completed.get(sequence);
            if (file != null && (file.busy || (published && !file.published))) throw new IllegalStateException("attachment_settlement_invalid");
            if (file != null) file.busy = true;
        }
        try {
            queue.settle(sequence, published);
            synchronized (this) { completed.remove(sequence); }
        } catch (Exception error) {
            synchronized (this) { Completed file = completed.get(sequence); if (file != null) file.busy = false; }
            throw error;
        }
    }
    @Override public void close() throws Exception {
        Exception failure = null;
        if (writer != null) { try { writer.close(); } catch (Exception error) { failure = error; } finally { writer = null; } }
        if (reservation != null) { try { reservation.close(); } catch (Exception error) { failure = error; } finally { reservation = null; } }
        if (failure != null) throw failure;
    }
}
