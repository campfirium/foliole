package com.foliole.android.framed;

import java.util.ArrayList;
import java.util.List;

/** Stable greedy packing of small descriptors; noneligible and large units keep their original single path. */
public final class FramedSyncBatchPacking<T extends FramedSyncBatchPacking.Item> {
    public static final long TARGET_BYTES = 1024 * 1024;
    public interface Item { long messageBytes(); boolean batchReady(); }
    public interface Delivery<T> { void send(List<T> items) throws Exception; }
    private final Delivery<T> delivery;
    private final List<T> pending = new ArrayList<>();
    private long bytes;

    public FramedSyncBatchPacking(Delivery<T> delivery) { this.delivery = delivery; }
    public void offer(T item) throws Exception {
        long size = item.messageBytes();
        if (size < 1) throw new IllegalArgumentException("framed_sync_batch_size_invalid");
        if (!item.batchReady() || size >= TARGET_BYTES) {
            flush();
            delivery.send(List.of(item));
            return;
        }
        if (!pending.isEmpty() && (pending.size() == FramedSyncTransferSequence.MAX_ITEMS || bytes + size > TARGET_BYTES)) flush();
        pending.add(item);
        bytes += size;
    }
    public void flush() throws Exception {
        if (pending.isEmpty()) return;
        List<T> selected = List.copyOf(pending);
        pending.clear();
        bytes = 0;
        delivery.send(selected);
    }
}
