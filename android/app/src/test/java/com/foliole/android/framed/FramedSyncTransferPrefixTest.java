package com.foliole.android.framed;

import static org.junit.Assert.*;
import java.util.List;
import org.junit.Test;

public final class FramedSyncTransferPrefixTest {
    @Test public void returnsOnlyTheStableCapacityPrefixAndNeverCrossesANonreadyUnit() {
        var prefix = new FramedSyncTransferPrefix<Item>();
        var first = new Item(400 * 1024, true);
        var second = new Item(400 * 1024, true);
        assertTrue(prefix.offer(first));
        assertTrue(prefix.offer(second));
        assertFalse(prefix.offer(new Item(300 * 1024, true)));
        assertFalse(prefix.offer(new Item(1, true)));
        assertEquals(List.of(first, second), prefix.items());
        prefix = new FramedSyncTransferPrefix<>();
        assertTrue(prefix.offer(first));
        assertFalse(prefix.offer(new Item(1, false)));
        assertEquals(List.of(first), prefix.items());
    }
    @Test public void preservesAnOriginalLargeOrNonreadyFirstUnitAsNonemptySingleton() {
        for (var first : List.of(new Item(3 * 1024 * 1024, true), new Item(96, false))) {
            var prefix = new FramedSyncTransferPrefix<Item>();
            assertTrue(prefix.offer(first));
            assertFalse(prefix.hasRoom());
            assertFalse(prefix.offer(new Item(1, true)));
            assertEquals(List.of(first), prefix.items());
        }
    }
    private static final class Item implements FramedSyncBatchPacking.Item {
        final long size;
        final boolean ready;
        Item(long size, boolean ready) { this.size = size; this.ready = ready; }
        @Override public long messageBytes() { return size; }
        @Override public boolean batchReady() { return ready; }
    }
}
