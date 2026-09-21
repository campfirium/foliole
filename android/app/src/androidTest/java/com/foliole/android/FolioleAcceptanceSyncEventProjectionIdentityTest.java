package com.foliole.android;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class FolioleAcceptanceSyncEventProjectionIdentityTest {
    @Test public void admitsOnlyTheTwoExactAcceptancePackages() {
        assertTrue(FolioleAcceptanceSyncEventProjection.isAcceptancePackage(
            "com.foliole.android.acceptance"));
        assertTrue(FolioleAcceptanceSyncEventProjection.isAcceptancePackage(
            "com.foliole.android.s220acceptance"));
        assertFalse(FolioleAcceptanceSyncEventProjection.isAcceptancePackage("com.foliole.android"));
        assertFalse(FolioleAcceptanceSyncEventProjection.isAcceptancePackage(
            "com.foliole.android.s220acceptance.other"));
        assertFalse(FolioleAcceptanceSyncEventProjection.isAcceptancePackage(null));
    }
}
