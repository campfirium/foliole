package com.foliole.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import org.junit.Test;

public class FolioleCompanionSyncGroupAuthorizationStoreTest {
    @Test public void persistsSignsRejectsReplayAndRevokes() throws Exception {
        Map<String, String> memberValues = new HashMap<>();
        Map<String, String> verificationValues = new HashMap<>();
        String secret = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("route-secret".getBytes(StandardCharsets.UTF_8));
        FolioleCompanionSyncGroupAuthorizationRecord member = record("member", secret);
        FolioleCompanionSyncGroupAuthorizationRecord verification = record("verification", secret);
        store("member", memberValues).save(member);
        store("verification", verificationValues).save(verification);

        FolioleCompanionSyncGroupAuthorizationStore restartedMember = store("member", memberValues);
        FolioleCompanionSyncGroupAuthorizationStore restartedVerification = store("verification", verificationValues);
        String timestamp = "2026-08-26T00:00:00.000Z";
        String signature = restartedMember.sign("route-a", "POST", "/sync", timestamp, "nonce-a", "body-hash");
        restartedVerification.verify("route-a", "POST", "/sync", timestamp, "nonce-a", "body-hash",
            signature, Instant.parse(timestamp).toEpochMilli());
        assertThrows(SecurityException.class, () -> restartedVerification.verify(
            "route-a", "POST", "/sync", timestamp, "nonce-a", "body-hash", signature,
            Instant.parse(timestamp).toEpochMilli()));
        assertTrue(restartedMember.revoke("route-a"));
        assertFalse(restartedMember.revoke("route-a"));
        assertThrows(SecurityException.class, () -> restartedMember.sign(
            "route-a", "POST", "/sync", timestamp, "nonce-b", "body-hash"));
        assertEquals("route-a", restartedVerification.load("route-a").routeId);
    }

    private static FolioleCompanionSyncGroupAuthorizationRecord record(String kind, String secret) {
        return new FolioleCompanionSyncGroupAuthorizationRecord(2, "authorization-a", null, "group-a",
            kind, "member-a", "member-manager", 4, "route-a", secret);
    }

    private static FolioleCompanionSyncGroupAuthorizationStore store(String kind, Map<String, String> values) {
        FolioleCompanionSyncGroupAuthorizationStore.Storage storage = new FolioleCompanionSyncGroupAuthorizationStore.Storage() {
            public String read(String key) { return values.get(key); }
            public void remove(String key) { values.remove(key); }
            public void write(String key, String value) { values.put(key, value); }
        };
        FolioleCompanionSyncGroupAuthorizationStore.Protector protector = new FolioleCompanionSyncGroupAuthorizationStore.Protector() {
            public String protect(String value) { return "protected:" + value; }
            public String unprotect(String value) { return value.substring("protected:".length()); }
        };
        return new FolioleCompanionSyncGroupAuthorizationStore(
            kind, "foliole-sync-group-route-hmac-v1", storage, protector);
    }
}
