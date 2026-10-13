package com.foliole.android;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public final class FolioleCompanionSyncGroupHttpErrorTest {
    @Test public void preservesRoundContentionForClientReleaseAndRetry() {
        for (String code : new String[] { "sync_round_busy", "sync_round_expired" }) {
            var response = new FolioleCompanionSyncGroupHttpError(new IllegalStateException(code));
            assertEquals(409, response.status);
            assertEquals(code, response.code);
        }
    }

    @Test public void keepsUnexpectedFailuresPrivateAndPreservesAdmissionErrors() {
        var unexpected = new FolioleCompanionSyncGroupHttpError(new IllegalStateException("private path"));
        assertEquals(500, unexpected.status);
        assertEquals("provider_error", unexpected.code);
        var invalid = new FolioleCompanionSyncGroupHttpError(new IllegalArgumentException("bad_request"));
        assertEquals(400, invalid.status);
        assertEquals("bad_request", invalid.code);
        var unauthorized = new FolioleCompanionSyncGroupHttpError(new SecurityException("bad_signature"));
        assertEquals(401, unauthorized.status);
        assertEquals("bad_signature", unauthorized.code);
    }

    @Test public void preservesSharedMemberHandshakeRequirement() {
        var response = new FolioleCompanionSyncGroupHttpError(
            new IllegalStateException("sync_group_member_state_required"));
        assertEquals(409, response.status);
        assertEquals("sync_group_member_state_required", response.code);
    }
}
