package com.foliole.android;

import android.content.Context;
import android.content.SharedPreferences;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

final class FolioleCompanionSyncGroupRequestAuth {
    private FolioleCompanionSyncGroupRequestAuth() {}

    static String authenticate(
        Context context,
        FolioleCompanionHttpRequest request,
        String groupId,
        FolioleCompanionSyncGroupDataBridge bridge
    ) throws Exception {
        String authorizationId = request.header("x-authorization-id");
        String nonce = request.header("x-nonce");
        String signature = request.header("x-signature");
        String timestamp = request.header("x-timestamp");
        if (authorizationId == null || nonce == null || signature == null || timestamp == null ||
            !groupId.equals(request.header("x-sync-group-id"))) throw new SecurityException("missing_headers");
        long drift = Math.abs(System.currentTimeMillis() - Instant.parse(timestamp).toEpochMilli());
        if (drift > 60_000) throw new SecurityException("expired_timestamp");
        String encodedSecret = FolioleCompanionWorkgroupSession.requireKey();
        String canonical = request.method + "\n" + request.path + "\n" + timestamp + "\n" + nonce + "\n" + sha256(request.body);
        String expected = FolioleCompanionPairingCrypto.signCanonicalRequest(encodedSecret, canonical);
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII), signature.getBytes(StandardCharsets.US_ASCII))) {
            throw new SecurityException("invalid_signature");
        }
        long now = System.currentTimeMillis();
        consumeNonce(context, groupId + ":" + authorizationId + ":" + timestamp + ":" + nonce, now);
        FolioleCompanionSyncGroupProvider.promoteApprovedJoin(groupId, authorizationId);
        return authorizationId;
    }

    private static void consumeNonce(Context context, String identity, long now) {
        SharedPreferences prefs = context.getSharedPreferences("foliole_workgroup_request_nonces", Context.MODE_PRIVATE);
        if (prefs.contains(identity)) throw new SecurityException("replayed_nonce");
        SharedPreferences.Editor editor = prefs.edit();
        for (String key : prefs.getAll().keySet()) if (prefs.getLong(key, 0) < now) editor.remove(key);
        if (!editor.putLong(identity, now + 60_000).commit()) {
            throw new IllegalStateException("Failed to persist workgroup request nonce.");
        }
    }

    private static String sha256(byte[] value) throws Exception {
        StringBuilder result = new StringBuilder();
        for (byte item : MessageDigest.getInstance("SHA-256").digest(value)) result.append(String.format("%02x", item));
        return result.toString();
    }
}
