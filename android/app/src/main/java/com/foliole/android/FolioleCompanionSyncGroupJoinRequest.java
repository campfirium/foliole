package com.foliole.android;

import org.json.JSONObject;

import java.time.Instant;
import java.util.UUID;

final class FolioleCompanionSyncGroupJoinRequest {
    String deviceId;
    final String deviceKind;
    String deviceName;
    final String expiresAt;
    final String pairingPublicKey;
    final String pairRequestId;
    final String requestedAt;
    final String remoteAddress;
    volatile String status = "pending";

    FolioleCompanionSyncGroupJoinRequest(JSONObject payload, String remoteAddress) throws Exception {
        this(required(payload, "device_id"), required(payload, "device_kind"), required(payload, "device_name"),
            Instant.now().plusSeconds(120).toString(), required(payload, "pairing_public_key"),
            "pair-" + UUID.randomUUID(), Instant.now().toString(), remoteAddress);
    }

    private FolioleCompanionSyncGroupJoinRequest(
        String deviceId, String deviceKind, String deviceName, String expiresAt, String pairingPublicKey,
        String pairRequestId, String requestedAt, String remoteAddress
    ) {
        this.deviceId = deviceId; this.deviceKind = deviceKind; this.deviceName = deviceName;
        this.expiresAt = expiresAt; this.pairingPublicKey = pairingPublicKey; this.pairRequestId = pairRequestId;
        this.requestedAt = requestedAt; this.remoteAddress = remoteAddress;
    }

    JSONObject publicJson() throws Exception {
        return new JSONObject().put("device_id", deviceId).put("device_kind", deviceKind)
            .put("device_name", deviceName).put("pair_request_id", pairRequestId)
            .put("requested_at", requestedAt).put("expires_at", expiresAt).put("status", status);
    }

    JSONObject grantJson() throws Exception {
        return publicJson().put("pairing_public_key", pairingPublicKey).put("remote_address", remoteAddress);
    }

    static FolioleCompanionSyncGroupJoinRequest fromGrantJson(JSONObject value) {
        FolioleCompanionSyncGroupJoinRequest request = new FolioleCompanionSyncGroupJoinRequest(
            required(value, "device_id"), required(value, "device_kind"), required(value, "device_name"),
            required(value, "expires_at"), required(value, "pairing_public_key"),
            required(value, "pair_request_id"), required(value, "requested_at"), required(value, "remote_address")
        );
        request.status = required(value, "status");
        return request;
    }

    boolean expired() { return Instant.now().isAfter(Instant.parse(expiresAt)); }

    boolean matches(JSONObject payload) {
        return deviceId.equals(payload.optString("device_id")) && pairingPublicKey.equals(payload.optString("pairing_public_key"));
    }

    void assign(JSONObject profile) {
        deviceId = required(profile, "device_id");
        deviceName = required(profile, "device_name");
    }

    private static String required(JSONObject payload, String key) {
        String value = payload.optString(key, "").trim();
        if (value.isEmpty()) throw new IllegalArgumentException("invalid_pair_request");
        return value;
    }
}
