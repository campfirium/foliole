package com.foliole.android;

import org.json.JSONObject;

import java.time.Instant;
import java.util.UUID;

final class FolioleCompanionSyncGroupJoinRequest {
    final String deviceId;
    final String deviceKind;
    final String deviceName;
    final String expiresAt;
    final String pairingPublicKey;
    final String pairRequestId;
    final String requestedAt;
    final String remoteAddress;
    volatile String deviceSecret;
    volatile String providerSecret;
    volatile String status = "pending";

    FolioleCompanionSyncGroupJoinRequest(JSONObject payload, String remoteAddress) throws Exception {
        deviceId = required(payload, "device_id");
        deviceKind = required(payload, "device_kind");
        deviceName = required(payload, "device_name");
        pairingPublicKey = required(payload, "pairing_public_key");
        pairRequestId = "pair-" + UUID.randomUUID();
        requestedAt = Instant.now().toString();
        expiresAt = Instant.now().plusSeconds(120).toString();
        this.remoteAddress = remoteAddress;
    }

    JSONObject publicJson() throws Exception {
        return new JSONObject().put("device_id", deviceId).put("device_kind", deviceKind)
            .put("device_name", deviceName).put("pair_request_id", pairRequestId)
            .put("requested_at", requestedAt).put("expires_at", expiresAt).put("status", status);
    }

    boolean expired() { return Instant.now().isAfter(Instant.parse(expiresAt)); }

    boolean matches(JSONObject payload) {
        return deviceId.equals(payload.optString("device_id")) && pairingPublicKey.equals(payload.optString("pairing_public_key"));
    }

    private static String required(JSONObject payload, String key) {
        String value = payload.optString(key, "").trim();
        if (value.isEmpty()) throw new IllegalArgumentException("invalid_pair_request");
        return value;
    }
}
