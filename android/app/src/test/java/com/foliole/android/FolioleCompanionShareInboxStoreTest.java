package com.foliole.android;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class FolioleCompanionShareInboxStoreTest {
    @Test
    public void rejectsPartsTheCompanionWouldTreatAsEmpty() {
        assertTrue(FolioleCompanionShareInboxStore.isBlankSharePart(" \t\r\n"));
        assertTrue(FolioleCompanionShareInboxStore.isBlankSharePart("\u00A0\u202F\u3000\uFEFF"));
        assertTrue(FolioleCompanionShareInboxStore.isBlankSharePart("\u2028\u2029"));
        assertTrue(FolioleCompanionShareInboxStore.isBlankSharePart("\u0000"));
        assertFalse(FolioleCompanionShareInboxStore.isBlankSharePart("\u00A0Keep these spaces\u00A0"));
        assertFalse(FolioleCompanionShareInboxStore.isBlankSharePart("\u0085"));
    }
}
