package com.foliole.android;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class FolioleCompanionPluginErrorsTest {
    @Test
    public void withCauseKeepsExceptionTypeAndMessageVisibleToJs() {
        String message = FolioleCompanionPluginErrors.withCause(
            "Failed to download companion desktop sync pack.",
            new IllegalArgumentException("Invalid sync pack container.")
        );

        assertEquals(
            "Failed to download companion desktop sync pack. Cause: IllegalArgumentException: Invalid sync pack container.",
            message
        );
    }
}
