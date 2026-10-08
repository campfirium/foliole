package com.foliole.android.framed;

import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public final class FramedSyncBatchPackingTest {
    @Test public void stableTargetPackingFlushesBeforeNoneligibleAndLargeOriginalUnits() throws Exception {
        List<List<Item>> sent = new ArrayList<>();
        var packing = new FramedSyncBatchPacking<Item>(items -> sent.add(items));
        var first = new Item(300 * 1024, true);
        var second = new Item(300 * 1024, true);
        var dependent = new Item(100, false);
        var large = new Item(2 * 1024 * 1024 + 96, true);
        var tail = new Item(100, true);
        for (var item : List.of(first, second, dependent, large, tail)) packing.offer(item);
        packing.flush();
        assertEquals(List.of(List.of(first, second), List.of(dependent), List.of(large), List.of(tail)), sent);
    }
    @Test public void countedBytesAndItemCapBoundBatchesAndPreserveTheFinalTail() throws Exception {
        List<List<Item>> sent = new ArrayList<>();
        var packing = new FramedSyncBatchPacking<Item>(items -> sent.add(items));
        for (int i = 0; i < 129; i++) packing.offer(new Item(96, true));
        packing.flush();
        assertEquals(128, sent.get(0).size());
        assertEquals(1, sent.get(1).size());
        sent.clear();
        for (int i = 0; i < 3; i++) packing.offer(new Item(600 * 1024, true));
        packing.flush();
        assertEquals(3, sent.size());
        assertEquals(1, sent.get(0).size());
    }
    private static final class Item implements FramedSyncBatchPacking.Item {
        final long bytes;
        final boolean ready;
        Item(long bytes, boolean ready) { this.bytes = bytes; this.ready = ready; }
        @Override public long messageBytes() { return bytes; }
        @Override public boolean batchReady() { return ready; }
    }
}
