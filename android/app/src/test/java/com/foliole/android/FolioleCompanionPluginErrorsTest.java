package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.io.IOException;
import java.net.ConnectException;
import java.net.SocketException;

import org.junit.Test;

public class FolioleCompanionPluginErrorsTest {
    @Test
    public void withCauseKeepsExceptionTypeAndMessageVisibleToJs() {
        String message = FolioleCompanionPluginErrors.withCause(
            "Failed to download companion desktop sync pack.",
            new IllegalArgumentException("sync_pack_target_mismatch")
        );

        assertEquals(
            "Failed to download companion desktop sync pack. Cause: IllegalArgumentException: sync_pack_target_mismatch",
            message
        );
    }

    @Test
    public void onlyConnectionFailuresReportAnUnreachablePeer() {
        for (Exception error : new Exception[] { new ConnectException("Failed to connect"),
                new SocketException("Connection reset"), new IOException("unexpected end of stream on peer") }) {
            assertEquals("E_PEER_UNREACHABLE", FolioleCompanionPluginErrors.peerUnreachableCode(error));
        }
        assertNull(FolioleCompanionPluginErrors.peerUnreachableCode(new IOException("write failed: ENOSPC")));
        assertNull(FolioleCompanionPluginErrors.peerUnreachableCode(new IllegalStateException("framed_sync_http_500")));
    }
}
