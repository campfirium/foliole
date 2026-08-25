package com.foliole.android;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

final class FolioleCompanionSyncGroupAuthorizationRecord {
    final int authorizationEpoch;
    final String authorizationId;
    final String endpointHint;
    final String groupId;
    final String kind;
    final String localMemberId;
    final String peerMemberId;
    final int protocolVersion;
    final String routeId;
    final String secret;

    FolioleCompanionSyncGroupAuthorizationRecord(
        int authorizationEpoch, String authorizationId, String endpointHint, String groupId,
        String kind, String localMemberId, String peerMemberId, int protocolVersion,
        String routeId, String secret
    ) {
        if (authorizationEpoch < 1 || protocolVersion != 4 ||
            !("member".equals(kind) || "verification".equals(kind))) {
            throw new IllegalArgumentException("sync_group_route_metadata_invalid");
        }
        this.authorizationEpoch = authorizationEpoch;
        this.authorizationId = required(authorizationId);
        this.endpointHint = endpointHint == null ? null : endpointHint.trim();
        this.groupId = required(groupId);
        this.kind = kind;
        this.localMemberId = required(localMemberId);
        this.peerMemberId = required(peerMemberId);
        this.protocolVersion = protocolVersion;
        this.routeId = required(routeId);
        this.secret = required(secret);
    }

    String encode() {
        return String.join(".", encode(String.valueOf(authorizationEpoch)), encode(authorizationId),
            encode(endpointHint == null ? "" : endpointHint), encode(groupId), encode(kind),
            encode(localMemberId), encode(peerMemberId), encode(String.valueOf(protocolVersion)),
            encode(routeId), encode(secret));
    }

    static FolioleCompanionSyncGroupAuthorizationRecord decode(String value) {
        String[] fields = value.split("\\.", -1);
        if (fields.length != 10) throw new SecurityException("sync_group_route_record_invalid");
        return new FolioleCompanionSyncGroupAuthorizationRecord(
            Integer.parseInt(decodeField(fields[0])), decodeField(fields[1]), emptyToNull(decodeField(fields[2])),
            decodeField(fields[3]), decodeField(fields[4]), decodeField(fields[5]), decodeField(fields[6]),
            Integer.parseInt(decodeField(fields[7])), decodeField(fields[8]), decodeField(fields[9]));
    }

    private static String encode(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String decodeField(String value) {
        return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
    }

    private static String required(String value) {
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException("sync_group_route_metadata_invalid");
        return value.trim();
    }

    private static String emptyToNull(String value) { return value.isEmpty() ? null : value; }
}
