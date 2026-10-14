package com.foliole.android;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public final class FolioleCompanionAttachmentRangeDownloadTest {
    @Test public void identifiesLocalStorageExhaustion() {
        assertEquals("disk_full", FolioleCompanionResourceFailure.classify(
            new java.io.IOException("No space left on device")));
    }
}
