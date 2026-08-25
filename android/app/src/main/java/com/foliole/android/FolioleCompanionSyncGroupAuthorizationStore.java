package com.foliole.android;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

final class FolioleCompanionSyncGroupAuthorizationStore {
    interface Storage {
        String read(String key);
        void remove(String key);
        void write(String key, String value);
    }

    interface Protector {
        String protect(String value) throws Exception;
        String unprotect(String value) throws Exception;
    }

    private static final long AUTH_WINDOW_MS = 60_000;
    private static final long NONCE_TTL_MS = 120_000;
    private final String canonicalVersion;
    private final String kind;
    private final Protector protector;
    private final Storage storage;

    FolioleCompanionSyncGroupAuthorizationStore(
        String kind, String canonicalVersion, Storage storage, Protector protector
    ) {
        this.kind = kind;
        this.canonicalVersion = canonicalVersion;
        this.storage = storage;
        this.protector = protector;
    }

    FolioleCompanionSyncGroupAuthorizationRecord load(String routeId) throws Exception {
        String protectedValue = storage.read(routeKey(routeId));
        if (protectedValue == null) return null;
        FolioleCompanionSyncGroupAuthorizationRecord record =
            FolioleCompanionSyncGroupAuthorizationRecord.decode(protector.unprotect(protectedValue));
        if (!kind.equals(record.kind) || !routeId.trim().equals(record.routeId)) {
            throw new SecurityException("sync_group_route_record_mismatch");
        }
        return record;
    }

    void save(FolioleCompanionSyncGroupAuthorizationRecord record) throws Exception {
        if (!kind.equals(record.kind)) throw new SecurityException("sync_group_route_kind_mismatch");
        storage.write(routeKey(record.routeId), protector.protect(record.encode()));
        if (load(record.routeId) == null) throw new IllegalStateException("sync_group_route_write_failed");
    }

    String sign(String routeId, String method, String path, String timestamp,
                String nonce, String bodyHash) throws Exception {
        FolioleCompanionSyncGroupAuthorizationRecord record = require(routeId);
        return hmac(record.secret, canonical(record, method, path, timestamp, nonce, bodyHash));
    }

    void verify(String routeId, String method, String path, String timestamp, String nonce,
                String bodyHash, String signature, long nowMs) throws Exception {
        if (!"verification".equals(kind)) throw new SecurityException("sync_group_route_kind_mismatch");
        long timestampMs = Instant.parse(timestamp).toEpochMilli();
        if (Math.abs(nowMs - timestampMs) > AUTH_WINDOW_MS) throw new SecurityException("expired_timestamp");
        FolioleCompanionSyncGroupAuthorizationRecord record = require(routeId);
        String expected = hmac(record.secret, canonical(record, method, path, timestamp, nonce, bodyHash));
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII),
            signature.getBytes(StandardCharsets.US_ASCII))) throw new SecurityException("invalid_signature");
        String nonceKey = "nonce:" + routeId.trim() + ":" + timestamp + ":" + nonce;
        String stored = storage.read(nonceKey);
        if (stored != null && Long.parseLong(protector.unprotect(stored)) > nowMs) {
            throw new SecurityException("replayed_nonce");
        }
        storage.write(nonceKey, protector.protect(String.valueOf(nowMs + NONCE_TTL_MS)));
    }

    boolean revoke(String routeId) {
        if (storage.read(routeKey(routeId)) == null) return false;
        storage.remove(routeKey(routeId));
        return true;
    }

    private FolioleCompanionSyncGroupAuthorizationRecord require(String routeId) throws Exception {
        FolioleCompanionSyncGroupAuthorizationRecord record = load(routeId);
        if (record == null) throw new SecurityException("sync_group_route_not_active");
        return record;
    }

    private String canonical(FolioleCompanionSyncGroupAuthorizationRecord record, String method,
                             String path, String timestamp, String nonce, String bodyHash) {
        return String.join("\n", canonicalVersion, method.trim().toUpperCase(), path, timestamp,
            nonce, bodyHash, record.groupId, record.localMemberId, record.peerMemberId,
            String.valueOf(record.authorizationEpoch), record.routeId);
    }

    private static String hmac(String encodedSecret, String canonical) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(Base64.getUrlDecoder().decode(encodedSecret), "HmacSHA256"));
        StringBuilder result = new StringBuilder();
        for (byte value : mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8))) {
            result.append(String.format("%02x", value));
        }
        return result.toString();
    }

    private static String routeKey(String routeId) { return "route:" + routeId.trim(); }
}
