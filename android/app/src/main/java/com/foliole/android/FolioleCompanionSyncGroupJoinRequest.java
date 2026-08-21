package com.foliole.android;

import org.json.JSONObject;

import java.time.Instant;
import java.util.UUID;

final class FolioleCompanionSyncGroupJoinRequest {
    String hostName;
    final String hostPlatform;
    final String expiresAt;
    final String pairingPublicKey;
    final String pairRequestId;
    final String requestedAt;
    final String remoteAddress;
    volatile String status = "pending";

    FolioleCompanionSyncGroupJoinRequest(JSONObject payload, String remoteAddress) throws Exception {
        this(required(payload, "host_name"), required(payload, "host_platform"),
            Instant.now().plusSeconds(120).toString(), required(payload, "pairing_public_key"),
            "pair-" + UUID.randomUUID(), Instant.now().toString(), remoteAddress);
    }

    private FolioleCompanionSyncGroupJoinRequest(
        String hostName, String hostPlatform,
        String expiresAt, String pairingPublicKey,
        String pairRequestId, String requestedAt, String remoteAddress
    ) {
        this.hostName = hostName; this.hostPlatform = hostPlatform;
        this.expiresAt = expiresAt; this.pairingPublicKey = pairingPublicKey; this.pairRequestId = pairRequestId;
        this.requestedAt = requestedAt; this.remoteAddress = remoteAddress;
    }

    JSONObject publicJson() throws Exception {
        return new JSONObject().put("host_name", hostName).put("host_platform", hostPlatform)
            .put("pair_request_id", pairRequestId)
            .put("requested_at", requestedAt).put("expires_at", expiresAt).put("status", status);
    }

    JSONObject grantJson() throws Exception {
        return publicJson().put("pairing_public_key", pairingPublicKey).put("remote_address", remoteAddress);
    }

    static FolioleCompanionSyncGroupJoinRequest fromGrantJson(JSONObject value) {
        FolioleCompanionSyncGroupJoinRequest request = new FolioleCompanionSyncGroupJoinRequest(
            required(value, "host_name"), required(value, "host_platform"),
            required(value, "expires_at"), required(value, "pairing_public_key"),
            required(value, "pair_request_id"), required(value, "requested_at"), required(value, "remote_address")
        );
        request.status = required(value, "status");
        return request;
    }

    boolean expired() { return Instant.now().isAfter(Instant.parse(expiresAt)); }

    boolean matches(JSONObject payload) {
        return hostName.equals(payload.optString("host_name"))
            && pairingPublicKey.equals(payload.optString("pairing_public_key"));
    }

    void assign(JSONObject profile) {
        hostName = required(profile, "host_name");
    }

    private static String required(JSONObject payload, String key) {
        String value = payload.optString(key, "").trim();
        if (value.isEmpty()) throw new IllegalArgumentException("invalid_pair_request");
        return value;
    }
}
