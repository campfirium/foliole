package com.foliole.android;

import android.content.Context;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

final class FolioleCompanionSyncGroupRequestAuth {
    private static final Map<String, Long> NONCES = new ConcurrentHashMap<>();
    private FolioleCompanionSyncGroupRequestAuth() {}

    static String authenticate(Context context, FolioleCompanionHttpRequest request, String groupId, String databasePath) throws Exception {
        String deviceId = request.header("x-device-id");
        String nonce = request.header("x-nonce");
        String signature = request.header("x-signature");
        String timestamp = request.header("x-timestamp");
        if (deviceId == null || nonce == null || signature == null || timestamp == null ||
            !groupId.equals(request.header("x-sync-group-id"))) throw new SecurityException("missing_headers");
        long drift = Math.abs(System.currentTimeMillis() - Instant.parse(timestamp).toEpochMilli());
        if (drift > 60_000) throw new SecurityException("expired_timestamp");
        byte[] secret = FolioleCompanionSyncGroupPeerStore.load(context, deviceId);
        if (secret == null) throw new SecurityException("unknown_device");
        String canonical = request.method + "\n" + request.path + "\n" + timestamp + "\n" + nonce + "\n" + sha256(request.body);
        String encodedSecret = android.util.Base64.encodeToString(secret, android.util.Base64.NO_WRAP | android.util.Base64.URL_SAFE | android.util.Base64.NO_PADDING);
        String expected = FolioleCompanionPairingCrypto.signCanonicalRequest(encodedSecret, canonical);
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII), signature.getBytes(StandardCharsets.US_ASCII))) {
            throw new SecurityException("invalid_signature");
        }
        long now = System.currentTimeMillis();
        NONCES.entrySet().removeIf(entry -> entry.getValue() < now);
        if (NONCES.putIfAbsent(deviceId + ":" + nonce, now + 60_000) != null) throw new SecurityException("replayed_nonce");
        FolioleCompanionSyncGroupProvider.promoteApprovedJoin(groupId, databasePath, deviceId);
        FolioleCompanionSyncGroupDatabase.requireAuthorizedMember(databasePath, groupId, deviceId);
        return deviceId;
    }

    private static String sha256(byte[] value) throws Exception {
        StringBuilder result = new StringBuilder();
        for (byte item : MessageDigest.getInstance("SHA-256").digest(value)) result.append(String.format("%02x", item));
        return result.toString();
    }
}
