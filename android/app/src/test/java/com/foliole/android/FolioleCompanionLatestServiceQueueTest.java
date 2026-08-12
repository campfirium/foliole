package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class FolioleCompanionLatestServiceQueueTest {
    @Test
    public void keepsOnlyTheLatestRevisionWithoutSuppressingAnotherDevice() {
        FolioleCompanionLatestServiceQueue<String> queue = new FolioleCompanionLatestServiceQueue<>();

        queue.offer("Group-runtimea--1", "A1");
        queue.offer("Group-runtimea--2", "A2");
        queue.offer("Group-runtimec--1", "C1");
        queue.offer("Group-runtimea--3", "A3");

        assertEquals("A3", queue.poll());
        assertEquals("C1", queue.poll());
        assertNull(queue.poll());
    }

    @Test
    public void preservesUnversionedServiceIdentity() {
        assertEquals("Legacy service",
            FolioleCompanionLatestServiceQueue.stableServiceKey("Legacy service"));
    }
}
