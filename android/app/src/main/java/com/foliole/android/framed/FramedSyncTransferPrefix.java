package com.foliole.android.framed;

import java.util.ArrayList;
import java.util.List;

/** A response returns only the first complete stable prefix; an original large first unit remains legal. */
public final class FramedSyncTransferPrefix<T extends FramedSyncBatchPacking.Item> {
    private final List<T> items = new ArrayList<>();
    private long bytes;
    private boolean ended;
    public boolean offer(T item) {
        if (ended) return false;
        long size = item.messageBytes();
        if (size < 1) throw new IllegalArgumentException("framed_sync_batch_size_invalid");
        if (!items.isEmpty() && (!item.batchReady() || bytes + size > FramedSyncBatchPacking.TARGET_BYTES)) {
            ended = true;
            return false;
        }
        items.add(item);
        bytes += size;
        ended = !item.batchReady() || bytes >= FramedSyncBatchPacking.TARGET_BYTES || items.size() == FramedSyncTransferSequence.MAX_ITEMS;
        return true;
    }
    public boolean hasRoom() { return !ended; }
    public List<T> items() { return List.copyOf(items); }
}
